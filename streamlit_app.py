from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from time import perf_counter
from uuid import uuid4

import streamlit as st

from diagnostic_selector import build_diagnostic_set
from next_question_selector import (
    rank_next_question_candidates,
    select_next_question,
)


APP_DIR = Path(__file__).resolve().parent
QUESTION_BANK_PATH = APP_DIR / "question_bank.json"


# ============================================================
# BASIC DATA / QUESTION HELPERS
# ============================================================

def load_question_bank():
    with QUESTION_BANK_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if isinstance(data, dict) and isinstance(data.get("questions"), list):
        return data["questions"]

    if isinstance(data, list):
        return data

    raise ValueError(
        "question_bank.json must be a list of questions or an object "
        "containing a 'questions' list."
    )


def make_id(prefix):
    return f"{prefix}_{uuid4().hex[:12]}"


def get_question_parts(question):
    solution = question.get("solution", {})
    parts = solution.get("parts", [])
    return [
        str(part.get("part"))
        for part in parts
        if part.get("part") is not None
    ]


def is_multipart(question):
    return bool(get_question_parts(question))


def normalise_part_name(part):
    if part is None:
        return None
    return str(part).strip().lower()


def get_solution_part(question, part):
    target = normalise_part_name(part)

    for solution_part in question.get("solution", {}).get("parts", []):
        if normalise_part_name(solution_part.get("part")) == target:
            return solution_part

    return None


def get_solution_steps(question, part=None):
    solution = question.get("solution", {})

    if "steps" in solution:
        return solution.get("steps", [])

    if "parts" in solution:
        target = normalise_part_name(part)

        for solution_part in solution["parts"]:
            if normalise_part_name(solution_part.get("part")) == target:
                return solution_part.get("steps", [])

    return []


def get_part_answer(question, part):
    answer = question.get("answer", {})

    if not is_multipart(question):
        return answer

    target = normalise_part_name(part)

    if isinstance(answer, dict) and isinstance(answer.get("parts"), list):
        for answer_part in answer["parts"]:
            if normalise_part_name(answer_part.get("part")) == target:
                return {
                    key: value
                    for key, value in answer_part.items()
                    if key != "part"
                }

    if isinstance(answer, dict) and isinstance(answer.get("parts"), dict):
        for key, value in answer["parts"].items():
            if normalise_part_name(key).strip("()") == target.strip("()"):
                return value

    if isinstance(answer, dict):
        possible_keys = [
            str(part),
            str(part).lower(),
            str(part).upper(),
            f"part_{str(part).lower()}",
            f"part {str(part).lower()}",
        ]
        for key in possible_keys:
            if key in answer:
                return answer[key]

    return answer


def _question_text_for_part(question, part=None):
    text = str(question.get("question", {}).get("text", ""))

    if part is None or not is_multipart(question):
        return text

    parts = get_question_parts(question)
    normalised_parts = [
        str(p).strip().lower().strip("()")
        for p in parts
    ]
    target = str(part).strip().lower().strip("()")

    if target not in normalised_parts:
        return text

    index = normalised_parts.index(target)
    start_match = re.search(
        rf"\({re.escape(target)}\)|\bpart\s+{re.escape(target)}\b",
        text,
        flags=re.IGNORECASE,
    )

    if not start_match:
        return text

    start = start_match.start()
    end = len(text)

    if index + 1 < len(normalised_parts):
        next_part = normalised_parts[index + 1]
        next_match = re.search(
            rf"\({re.escape(next_part)}\)|\bpart\s+{re.escape(next_part)}\b",
            text[start_match.end():],
            flags=re.IGNORECASE,
        )
        if next_match:
            end = start_match.end() + next_match.start()

    return text[start:end]


def is_show_that_task(question, part=None):
    wording = _question_text_for_part(question, part).lower()
    return any(
        phrase in wording
        for phrase in ("show that", "prove that", "verify that")
    )


def get_reveal_state(question):
    parts = get_question_parts(question)

    if parts:
        return {
            part: [False] * len(get_solution_steps(question, part))
            for part in parts
        }

    return {None: [False] * len(get_solution_steps(question))}


def _display_value(value, indent=0):
    """Readable display of the bank's stored answer values."""
    prefix = " " * indent

    if isinstance(value, dict):
        value_type = value.get("__type__")

        if value_type == "sympy":
            return prefix + str(value.get("expression", ""))

        if value_type == "tuple":
            items = value.get("items", [])
            return prefix + "(" + ", ".join(
                _display_value(item).strip() for item in items
            ) + ")"

        if value_type == "set":
            items = value.get("items", [])
            return prefix + "{" + ", ".join(
                _display_value(item).strip() for item in items
            ) + "}"

        if value_type == "repr":
            return prefix + str(value.get("value", ""))

        lines = []
        for key, item in value.items():
            readable_key = key.replace("_", " ").title()
            rendered = _display_value(item, indent + 4)
            if isinstance(item, (dict, list)):
                lines.append(f"{prefix}{readable_key}:")
                lines.append(rendered)
            else:
                lines.append(f"{prefix}{readable_key}: {rendered.strip()}")
        return "\n".join(lines)

    if isinstance(value, list):
        return "\n".join(_display_value(item, indent) for item in value)

    return prefix + str(value)


# ============================================================
# IN-MEMORY SESSION / ATTEMPT LOGGING
# ============================================================

def now_iso():
    return datetime.now().isoformat()


def session_events():
    return st.session_state.setdefault("events", [])


def attempt_summaries():
    return st.session_state.setdefault("attempt_summaries", [])


def record_session_event(event_type, **details):
    session_events().append({
        "record_type": "session_event",
        "schema_version": 1,
        "session_id": st.session_state.get("session_id"),
        "event_type": event_type,
        "timestamp": now_iso(),
        **details,
    })


def record_selection_event(question, phase, **details):
    session_events().append({
        "record_type": "selection_event",
        "schema_version": 1,
        "session_id": st.session_state.get("session_id"),
        "event_type": "question_selected",
        "timestamp": now_iso(),
        "selection_phase": phase,
        "question_id": str(question.get("question_id", "unknown")),
        **details,
    })


def record_attempt_event(event_type, part=None, **details):
    attempt = st.session_state.attempt
    now_perf = perf_counter()
    attempt["event_index"] += 1

    event = {
        "record_type": "practice_event",
        "schema_version": 1,
        "session_id": st.session_state.session_id,
        "attempt_id": attempt["attempt_id"],
        "question_id": attempt["question_id"],
        "question_number": attempt["question_number"],
        "event_index": attempt["event_index"],
        "event_type": event_type,
        "part": part,
        "timestamp": now_iso(),
        "seconds_since_question_started": round(
            now_perf - attempt["started_perf"], 3
        ),
        "seconds_since_previous_event": round(
            now_perf - attempt["last_event_perf"], 3
        ),
        "details": details,
    }

    attempt["last_event_perf"] = now_perf
    attempt["events"].append(event)
    session_events().append(event)


def build_part_summaries(parts):
    attempt = st.session_state.attempt
    targets = parts if parts else [None]
    summaries = {}

    for part in targets:
        relevant = [
            event
            for event in attempt["events"]
            if event.get("part") == part
        ]
        reveals = [
            event for event in relevant
            if event["event_type"] == "markscheme_step_revealed"
        ]
        checks = [
            event for event in relevant
            if event["event_type"] == "answer_judged"
        ]
        solutions = [
            event for event in relevant
            if event["event_type"] == "solution_revealed"
        ]
        correct_checks = [
            event for event in checks
            if event.get("details", {}).get("correct") is True
        ]

        first_check = checks[0] if checks else None
        first_correct = correct_checks[0] if correct_checks else None
        key = str(part) if part is not None else "whole_question"

        summaries[key] = {
            "markscheme_steps_revealed": len(reveals),
            "checks_made": len(checks),
            "incorrect_checks": sum(
                1 for event in checks
                if event.get("details", {}).get("correct") is False
            ),
            "first_check_correct": (
                first_check.get("details", {}).get("correct")
                if first_check else None
            ),
            "eventually_checked_correct": bool(correct_checks),
            "solution_revealed": bool(solutions),
            "seconds_to_first_markscheme_reveal": (
                reveals[0]["seconds_since_question_started"]
                if reveals else None
            ),
            "seconds_to_first_check": (
                first_check["seconds_since_question_started"]
                if first_check else None
            ),
            "seconds_to_first_correct_check": (
                first_correct["seconds_since_question_started"]
                if first_correct else None
            ),
            "markscheme_steps_revealed_before_first_check": (
                sum(
                    1 for event in reveals
                    if event["event_index"] < first_check["event_index"]
                )
                if first_check else len(reveals)
            ),
            "solution_seen_before_first_check": (
                any(
                    event["event_index"] < first_check["event_index"]
                    for event in solutions
                )
                if first_check else bool(solutions)
            ),
        }

    return summaries


def finish_attempt(outcome, session_ended=False):
    if not st.session_state.get("attempt"):
        return None

    question = st.session_state.current_question
    parts = get_question_parts(question)

    record_attempt_event(
        "question_ended",
        outcome=outcome,
        session_ended=session_ended,
    )

    attempt = st.session_state.attempt
    summary = {
        "record_type": "question_attempt_summary",
        "schema_version": 1,
        "session_id": st.session_state.session_id,
        "attempt_id": attempt["attempt_id"],
        "question_id": attempt["question_id"],
        "question_number": attempt["question_number"],
        "session_total_questions": attempt["session_total"],
        "started_at": attempt["started_at"],
        "finished_at": now_iso(),
        "duration_seconds": round(
            perf_counter() - attempt["started_perf"], 3
        ),
        "outcome": outcome,
        "session_ended_during_question": session_ended,
        "multipart": bool(parts),
        "parts": parts or [],
        "event_count": len(attempt["events"]),
        "part_summaries": build_part_summaries(parts),
        "generative_structure": question.get("generative_structure", {}),
        "emergent_structure": question.get("emergent_structure", {}),
    }

    attempt_summaries().append(summary)
    st.session_state.attempt = None
    return summary


# ============================================================
# SESSION PROGRESSION
# ============================================================

def initialise_question(question, number, total, phase_label):
    parts = get_question_parts(question)
    keys = parts if parts else [None]
    started_perf = perf_counter()

    st.session_state.current_question = question
    st.session_state.phase_label = phase_label
    st.session_state.display_number = number
    st.session_state.display_total = total
    st.session_state.reveal_state = get_reveal_state(question)
    st.session_state.check_counts = {part: 0 for part in keys}
    st.session_state.last_check_correct = {part: None for part in keys}
    st.session_state.solution_seen = {part: False for part in keys}
    st.session_state.check_pending_part = "__none__"
    st.session_state.attempt = {
        "attempt_id": make_id("attempt"),
        "question_id": question.get("question_id", "unknown"),
        "question_number": number,
        "session_total": total,
        "started_at": now_iso(),
        "started_perf": started_perf,
        "last_event_perf": started_perf,
        "events": [],
        "event_index": 0,
    }

    record_attempt_event(
        "question_presented",
        multipart=bool(parts),
        available_parts=parts,
        total_marks=question.get("solution", {}).get("total_marks"),
    )


def select_and_initialise_next_question():
    questions = st.session_state.questions
    diagnostic = st.session_state.diagnostic_questions

    if st.session_state.diagnostic_index < len(diagnostic):
        question = diagnostic[st.session_state.diagnostic_index]
        st.session_state.diagnostic_index += 1
        st.session_state.diagnostic_question_number += 1

        question_id = str(question.get("question_id", "unknown"))
        st.session_state.attempted_or_queued_ids.add(question_id)

        record_selection_event(
            question,
            "diagnostic",
            diagnostic_position=st.session_state.diagnostic_index,
            diagnostic_total=len(diagnostic),
        )

        initialise_question(
            question,
            st.session_state.diagnostic_question_number,
            len(diagnostic),
            "Diagnostic",
        )
        return

    if not st.session_state.adaptive_phase_announced:
        st.session_state.adaptive_phase_announced = True
        st.session_state.show_adaptive_message = True
        record_session_event(
            "adaptive_phase_started",
            diagnostic_questions_completed=(
                st.session_state.diagnostic_question_number
            ),
        )

    attempts = attempt_summaries()
    question = select_next_question(
        questions=questions,
        attempt_summaries=attempts,
        exclude_question_ids=st.session_state.attempted_or_queued_ids,
    )

    if question is None:
        end_session("bank_completed")
        return

    st.session_state.adaptive_question_number += 1
    question_id = str(question.get("question_id", "unknown"))

    ranking = rank_next_question_candidates(
        questions=questions,
        attempt_summaries=attempts,
        exclude_question_ids=st.session_state.attempted_or_queued_ids,
    )
    selected_candidate = ranking[0] if ranking else None

    st.session_state.attempted_or_queued_ids.add(question_id)

    record_selection_event(
        question,
        "adaptive",
        personalised_position=st.session_state.adaptive_question_number,
        selected_candidate_evidence=selected_candidate,
        eligible_candidate_count=len(ranking),
    )

    initialise_question(
        question,
        st.session_state.adaptive_question_number,
        None,
        "Personalised",
    )


def start_session():
    questions = load_question_bank()
    diagnostic = build_diagnostic_set(questions)
    session_id = make_id("session")

    st.session_state.clear()
    st.session_state.started = True
    st.session_state.finished = False
    st.session_state.session_id = session_id
    st.session_state.session_started_at = now_iso()
    st.session_state.session_started_perf = perf_counter()
    st.session_state.questions = questions
    st.session_state.diagnostic_questions = diagnostic
    st.session_state.diagnostic_index = 0
    st.session_state.diagnostic_question_number = 0
    st.session_state.adaptive_question_number = 0
    st.session_state.adaptive_phase_announced = False
    st.session_state.show_adaptive_message = False
    st.session_state.attempted_or_queued_ids = set()
    st.session_state.events = []
    st.session_state.attempt_summaries = []
    st.session_state.current_question = None
    st.session_state.attempt = None

    diagnostic_ids = [
        str(question.get("question_id", "unknown"))
        for question in diagnostic
    ]
    record_session_event(
        "session_started",
        bank_question_count=len(questions),
        diagnostic_question_count=len(diagnostic),
        selection_method="diagnostic_then_adaptive_v1",
        diagnostic_question_order=diagnostic_ids,
    )
    select_and_initialise_next_question()


def move_to_next_question(outcome):
    finish_attempt(outcome)
    select_and_initialise_next_question()
    st.rerun()


def end_session(outcome="user_quit"):
    if st.session_state.get("finished"):
        return

    if st.session_state.get("attempt"):
        finish_attempt("session_ended", session_ended=True)

    duration = None
    if st.session_state.get("session_started_perf") is not None:
        duration = round(
            perf_counter() - st.session_state.session_started_perf, 3
        )

    record_session_event(
        "session_ended",
        duration_seconds=duration,
        outcome=outcome,
        questions_attempted=len(attempt_summaries()),
        diagnostic_questions_completed=min(
            len(attempt_summaries()),
            len(st.session_state.get("diagnostic_questions", [])),
        ),
    )
    st.session_state.finished = True
    st.session_state.session_outcome = outcome
    st.session_state.current_question = None
    st.session_state.attempt = None


# ============================================================
# RENDERING
# ============================================================

def render_step(step):
    step_number = step.get("step", "?")
    description = step.get("description", "")
    st.markdown(f"**Step {step_number}: {description}**")

    working = step.get("working")
    if working:
        st.text(working)

    marks_available = step.get("marks_available")
    if marks_available is not None:
        st.caption(f"{marks_available} mark(s)")

    for mark in step.get("marks", []):
        mark_value = mark.get("marks", 1)
        criterion = mark.get("criterion", "")
        st.markdown(f"- **{mark_value} mark:** {criterion}")

    alternatives = step.get("alternative_valid_routes", [])
    if alternatives:
        st.markdown("**Alternative valid route(s):**")
        for route in alternatives:
            st.markdown(f"- {route}")


def render_full_solution(question, part=None):
    solution = question.get("solution")

    if not solution:
        st.info("No worked solution is stored for this question.")
        return

    if part is not None and is_multipart(question):
        solution_part = get_solution_part(question, part)
        if solution_part is None:
            st.info(f"No worked solution is stored for part {part}.")
            return

        marks = solution_part.get("marks_available", "?")
        st.subheader(
            f"Worked solution — Part {str(part).upper()} — {marks} marks"
        )
        for step in solution_part.get("steps", []):
            render_step(step)
        return

    total_marks = solution.get("total_marks")
    heading = "Worked solution"
    if total_marks is not None:
        heading += f" — {total_marks} marks"
    st.subheader(heading)

    if "parts" in solution:
        for solution_part in solution["parts"]:
            part_name = str(solution_part.get("part", "")).upper()
            marks = solution_part.get("marks_available", "?")
            st.markdown(f"### Part {part_name} — {marks} marks")
            for step in solution_part.get("steps", []):
                render_step(step)
    else:
        for step in solution.get("steps", []):
            render_step(step)

    important_note = solution.get("important_note")
    if important_note:
        st.warning(f"Important note: {important_note}")


def current_action_part(question, key_suffix):
    parts = get_question_parts(question)
    if not parts:
        return None

    return st.radio(
        "Part",
        parts,
        horizontal=True,
        key=f"part_selector_{key_suffix}_{question.get('question_id')}",
        format_func=lambda value: f"Part {str(value).upper()}",
    )


def render_markscheme(question):
    st.markdown("Reveal only the part of the solution you want to inspect.")
    part = current_action_part(question, "markscheme")
    steps = get_solution_steps(question, part)

    if not steps:
        st.info("No mark scheme is stored for this question.")
        return

    state = st.session_state.reveal_state[part]

    for index, step in enumerate(steps):
        description = step.get("description", f"Step {index + 1}")
        revealed = state[index]

        with st.container(border=True):
            st.markdown(
                f"**Step {index + 1}: {description}** "
                + ("— Revealed" if revealed else "— Hidden")
            )

            if revealed:
                render_step(step)
            elif st.button(
                f"Reveal step {index + 1}",
                key=(
                    f"reveal_{question.get('question_id')}_"
                    f"{part}_{index}"
                ),
            ):
                state[index] = True
                record_attempt_event(
                    "markscheme_step_revealed",
                    part=part,
                    step_number=index + 1,
                    solution_step=step.get("step"),
                    description=step.get("description", ""),
                    marks_available=step.get("marks_available"),
                )
                st.rerun()

    if st.button(
        "Reveal full worked solution",
        key=f"full_ms_{question.get('question_id')}_{part}",
    ):
        newly_revealed = []
        for index in range(len(state)):
            if not state[index]:
                state[index] = True
                newly_revealed.append(index + 1)

        record_attempt_event(
            "full_solution_revealed",
            part=part,
            newly_revealed_steps=newly_revealed,
            total_steps=len(state),
        )
        st.session_state.solution_seen[part] = True
        record_attempt_event(
            "solution_revealed",
            part=part,
            revealed_steps_before_solution=(
                len(state) - len(newly_revealed)
            ),
            checks_before_solution=st.session_state.check_counts[part],
            context="markscheme_full",
        )
        st.rerun()


def begin_check(question, part):
    previous_checks = st.session_state.check_counts[part]
    previous_result = st.session_state.last_check_correct[part]
    show_that = is_show_that_task(question, part)

    record_attempt_event(
        "check_requested",
        part=part,
        check_number=previous_checks + 1,
        revealed_steps_before_check=sum(
            st.session_state.reveal_state[part]
        ),
        solution_seen_before_check=st.session_state.solution_seen[part],
        previous_checks=previous_checks,
        previous_recorded_result=previous_result,
        check_mode=(
            "show_that_outcome" if show_that else "answer_comparison"
        ),
    )

    if show_that:
        record_attempt_event(
            "show_that_outcome_prompted",
            part=part,
            check_number=previous_checks + 1,
        )
    else:
        record_attempt_event(
            "answer_revealed_for_check",
            part=part,
            check_number=previous_checks + 1,
        )

    st.session_state.check_pending_part = part


def judge_check(question, part, correct):
    st.session_state.check_counts[part] += 1
    st.session_state.last_check_correct[part] = correct

    record_attempt_event(
        "answer_judged",
        part=part,
        check_number=st.session_state.check_counts[part],
        correct=correct,
        revealed_steps_before_check=sum(
            st.session_state.reveal_state[part]
        ),
        solution_seen_before_check=st.session_state.solution_seen[part],
        check_mode=(
            "show_that_outcome"
            if is_show_that_task(question, part)
            else "answer_comparison"
        ),
    )
    st.session_state.check_pending_part = "__none__"


def render_check(question):
    part = current_action_part(question, "check")
    pending = st.session_state.check_pending_part

    if pending == "__none__":
        if is_multipart(question):
            status = st.session_state.last_check_correct[part]
            count = st.session_state.check_counts[part]
            if count == 0:
                st.caption("This part has not been checked yet.")
            elif status is True:
                st.caption("Last check: recorded correct.")
            elif status is False:
                st.caption("Last check: recorded not correct.")

        if st.button(
            "Compare / check my work",
            type="primary",
            key=f"begin_check_{question.get('question_id')}_{part}",
        ):
            begin_check(question, part)
            st.rerun()
        return

    part = pending
    show_that = is_show_that_task(question, part)

    if part is not None:
        st.markdown(f"### Part {str(part).upper()}")

    if show_that:
        st.markdown("### Show-that check")
        st.write(
            "The required result is already stated in the question, "
            "so there is no separate final answer to reveal."
        )
        st.write(
            "Use the mark scheme if you want to compare the route or "
            "individual working steps."
        )
        st.write(
            "**Did you successfully reach the stated result from valid working?**"
        )
    else:
        st.markdown("### Compare your answer")
        answer = (
            get_part_answer(question, part)
            if is_multipart(question)
            else question.get("answer", {})
        )
        st.code(_display_value(answer), language=None)
        st.write("**Does your answer agree with this?**")

    yes_col, no_col = st.columns(2)
    if yes_col.button(
        "Yes — correct",
        type="primary",
        use_container_width=True,
        key=f"judge_yes_{question.get('question_id')}_{part}",
    ):
        judge_check(question, part, True)
        st.rerun()

    if no_col.button(
        "No — not correct",
        use_container_width=True,
        key=f"judge_no_{question.get('question_id')}_{part}",
    ):
        judge_check(question, part, False)
        st.rerun()


def render_solution_area(question):
    part = current_action_part(question, "solution")

    if st.button(
        "Show full worked solution",
        key=f"show_solution_{question.get('question_id')}_{part}",
    ):
        before = sum(st.session_state.reveal_state[part])
        record_attempt_event(
            "solution_requested",
            part=part,
            revealed_steps_before_solution=before,
            checks_before_solution=st.session_state.check_counts[part],
        )
        st.session_state.solution_seen[part] = True
        st.session_state.reveal_state[part] = [
            True for _ in st.session_state.reveal_state[part]
        ]
        record_attempt_event(
            "solution_revealed",
            part=part,
            revealed_steps_before_solution=before,
            checks_before_solution=st.session_state.check_counts[part],
        )
        st.rerun()

    if st.session_state.solution_seen[part]:
        render_full_solution(question, part)


def render_session_download():
    if not st.session_state.get("started"):
        return

    payload = {
        "session_id": st.session_state.get("session_id"),
        "session_started_at": st.session_state.get("session_started_at"),
        "events": st.session_state.get("events", []),
        "attempt_summaries": st.session_state.get(
            "attempt_summaries", []
        ),
    }

    st.sidebar.download_button(
        "Download session log",
        data=json.dumps(payload, indent=2, ensure_ascii=False),
        file_name=f"dojo_session_{st.session_state.session_id}.json",
        mime="application/json",
        use_container_width=True,
    )


def render_question():
    question = st.session_state.current_question
    phase = st.session_state.phase_label
    number = st.session_state.display_number
    total = st.session_state.display_total
    total_marks = question.get("solution", {}).get("total_marks")

    if st.session_state.get("show_adaptive_message"):
        st.success(
            "Diagnostic complete. DOJO is now choosing questions from "
            "what has happened in this session."
        )
        st.session_state.show_adaptive_message = False

    if total is None:
        st.caption(f"{phase.upper()} QUESTION {number}")
    else:
        st.caption(f"{phase.upper()} QUESTION {number} OF {total}")

    if total_marks is not None:
        st.caption(f"{total_marks} marks")

    st.text(question.get("question", {}).get(
        "text", "Question text missing."
    ))

    if is_multipart(question):
        st.info(
            "Checks and mark-scheme reveals are tracked separately by part. "
            "You can work on the parts in any order."
        )

    st.divider()

    check_tab, markscheme_tab, solution_tab = st.tabs([
        "Check",
        "Mark scheme",
        "Full solution",
    ])

    with check_tab:
        render_check(question)

    with markscheme_tab:
        render_markscheme(question)

    with solution_tab:
        render_solution_area(question)

    st.divider()

    last_results = st.session_state.last_check_correct
    if any(result is True for result in last_results.values()):
        st.success("Recorded as correct.")
    elif any(result is False for result in last_results.values()):
        st.warning(
            "Recorded as not correct. Keep working, check again, "
            "or inspect the mark scheme."
        )

    next_col, skip_col = st.columns(2)

    if is_multipart(question):
        if next_col.button(
            "Next question",
            type="primary",
            use_container_width=True,
        ):
            record_attempt_event(
                "next_requested",
                context="multipart_question",
            )
            move_to_next_question("completed")
    else:
        correct = st.session_state.last_check_correct[None] is True
        solution_seen = st.session_state.solution_seen[None]

        if correct or solution_seen:
            if next_col.button(
                "Next question",
                type="primary",
                use_container_width=True,
            ):
                context = (
                    "after_correct" if correct else "after_solution"
                )
                record_attempt_event(
                    "next_requested",
                    context=context,
                )
                move_to_next_question(
                    "correct" if correct else "solution_revealed"
                )
        else:
            next_col.caption(
                "Check your work, reveal the solution, or skip to move on."
            )

    if skip_col.button("Skip question", use_container_width=True):
        record_attempt_event("skip_requested")
        move_to_next_question("skipped")

    if st.button("Finish session"):
        record_attempt_event("quit_requested")
        end_session("user_quit")
        st.rerun()


def render_finished():
    outcome = st.session_state.get("session_outcome")

    if outcome == "bank_completed":
        st.success(
            "You've reached the end of the currently available question bank."
        )
    else:
        st.success("Session ended.")

    st.write(
        f"Questions attempted: **{len(st.session_state.attempt_summaries)}**"
    )
    st.write(
        "Use **Download session log** in the sidebar if you want to "
        "keep this beta session data."
    )

    if st.button("Start a new session", type="primary"):
        start_session()
        st.rerun()


# ============================================================
# APP
# ============================================================

st.set_page_config(
    page_title="DOJO",
    page_icon="🥋",
    layout="centered",
)

st.title("DOJO")
st.caption("A-level Maths Practice — Implicit Differentiation")

if not st.session_state.get("started"):
    st.write(
        "Work on paper. When you've finished a question or part, use "
        "**Check** to compare your result."
    )
    st.write(
        "You can inspect the mark scheme selectively at any time. "
        "The session begins with a short diagnostic, then DOJO chooses "
        "subsequent questions from what has happened in the session."
    )

    try:
        bank_count = len(load_question_bank())
        st.caption(f"{bank_count} questions currently available.")
    except Exception as exc:
        st.error(f"Could not load question_bank.json: {exc}")
        st.stop()

    if st.button("Begin practice", type="primary"):
        start_session()
        st.rerun()
else:
    render_session_download()

    if st.session_state.get("finished"):
        render_finished()
    elif st.session_state.get("current_question") is not None:
        render_question()

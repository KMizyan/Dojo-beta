from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
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
QUESTION_BANK_PATH = APP_DIR / "rendered_question_bank.json"


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
        "rendered_question_bank.json must be a list of questions or an object "
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
# STUDENT-FACING PRE-RENDERED DISPLAY
# ============================================================

def render_display_blocks(blocks):
    """Display blocks built offline. No SymPy parsing happens here."""
    for block in blocks or []:
        block_type=block.get("type"); content=block.get("content","")
        if block_type=="spacer": st.write("")
        elif block_type=="latex": st.latex(content)
        elif block_type=="caption": st.caption(content)
        else: st.markdown(content)

def get_answer_display_blocks(question,part=None):
    answer_blocks=question.get("display",{}).get("answer_blocks",{})
    if not is_multipart(question): return answer_blocks.get("__whole_question__",[])
    target=normalise_part_name(part)
    for key,blocks in answer_blocks.items():
        if normalise_part_name(key)==target: return blocks
    return []

# ============================================================
# ASK DOJO — QUESTION-SCOPED TUTOR CHAT
# ============================================================

DOJO_TUTOR_MODEL = "gpt-5.6-luna"


def _strip_display_fields(value):
    """Remove pre-rendered UI data before sending question context to the tutor."""
    if isinstance(value, dict):
        return {
            key: _strip_display_fields(item)
            for key, item in value.items()
            if key not in {"display", "display_blocks"}
        }
    if isinstance(value, list):
        return [_strip_display_fields(item) for item in value]
    return value


def _tutor_context(question):
    """
    Build temporary context for the current question only.

    The reviewed stored solution is the mathematical source of truth.
    No learner history or previous-question information is included.
    """
    return {
        "question_id": question.get("question_id"),
        "question_text": question.get("question", {}).get("text", ""),
        "answer": _strip_display_fields(question.get("answer", {})),
        "reviewed_model_solution": _strip_display_fields(
            question.get("solution", {})
        ),
        "generative_structure": _strip_display_fields(
            question.get("generative_structure", {})
        ),
        "emergent_structure": _strip_display_fields(
            question.get("emergent_structure", {})
        ),
    }


def _openai_response_text(response_data):
    """Extract assistant text from a raw Responses API response."""
    pieces = []

    for item in response_data.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                text_value = content.get("text")
                if text_value:
                    pieces.append(str(text_value))

    return "\n".join(pieces).strip()


def ask_dojo_tutor(question, chat_messages):
    """
    Ask the tutor about the current question.

    Uses the OpenAI Responses API directly so the app needs no extra Python
    package. The response is not stored by OpenAI through the Responses API.
    """
    try:
        api_key = str(st.secrets["OPENAI_API_KEY"])
    except Exception as exc:
        raise RuntimeError(
            "OPENAI_API_KEY is not available in Streamlit secrets."
        ) from exc

    context = _tutor_context(question)

    instructions = """You are Ask DOJO, an A-level mathematics teacher helping a
student with ONE current practice question.

The supplied reviewed DOJO model solution is your mathematical source of truth.
Use it to understand the intended method, answer and reasoning rather than
re-solving the question from scratch unnecessarily.

Your job is to respond like a teacher who has walked over to the student's desk:
answer the exact point of confusion they raise. Explain why a step works, unpack
notation, expand a conceptual point, compare expressions, or give a small nudge
when appropriate.

Important behaviour:
- Work only with the current question and supplied DOJO context.
- Do not infer or discuss a learner profile, ability level, previous questions,
  or personalised history.
- Do not claim to remember anything outside this question's chat.
- Prefer familiar A-level notation and clear mathematical language.
- Be concise by default, but expand when the student asks for more detail.
- Do not automatically dump the whole solution when the student asks about one
  step.
- Do not reveal later steps unnecessarily. If the student explicitly asks for
  the answer, full method, or later working, you may provide it.
- If the student's wording is ambiguous, use the question and reviewed solution
  to infer the most likely mathematical reference; ask a short clarification
  only when genuinely necessary.
- If the supplied reviewed solution does not support a claim, say so rather
  than inventing a DOJO-specific fact.
- Format mathematics for Streamlit Markdown using dollar-sign LaTeX delimiters ONLY.
  Use `$...$` for inline mathematics and `$$...$$` for displayed mathematics.
  Never use `\\(...\\)` or `\\[...\\]` delimiters, because this app will display
  those as literal text rather than rendered maths.
- Put important algebraic working on its own displayed-maths line where that makes
  the steps easier to follow. Keep explanatory prose outside the maths delimiters."""

    input_items = [
        {
            "role": "user",
            "content": (
                "Here is the complete DOJO context for the current question. "
                "Treat it as reference material, not as a student message:\n\n"
                + json.dumps(context, ensure_ascii=False, indent=2)
            ),
        }
    ]

    for message in chat_messages:
        role = message.get("role")
        content = str(message.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            input_items.append({
                "role": role,
                "content": content,
            })

    payload = {
        "model": DOJO_TUTOR_MODEL,
        "instructions": instructions,
        "input": input_items,
        "reasoning": {"effort": "low"},
        "text": {"verbosity": "low"},
        "max_output_tokens": 700,
        "store": False,
    }

    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            response_data = json.loads(
                response.read().decode("utf-8")
            )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Ask DOJO returned HTTP {exc.code}: {body}"
        ) from exc
    except Exception as exc:
        raise RuntimeError(f"Ask DOJO could not respond: {exc}") from exc

    answer = _openai_response_text(response_data)
    if not answer:
        raise RuntimeError("Ask DOJO returned no text.")

    return answer


def _ensure_question_chat(question):
    """
    Give every new question a clean chat.

    This deliberately does not restore chat from Supabase or learner history.
    """
    question_id = str(question.get("question_id", "unknown"))

    if st.session_state.get("dojo_chat_question_id") != question_id:
        st.session_state.dojo_chat_question_id = question_id
        st.session_state.dojo_chat_messages = []


def render_dojo_chat(question):
    """Question-scoped tutor chat in a fixed-height side panel."""
    _ensure_question_chat(question)

    st.subheader("Ask DOJO")
    st.caption(
        "Ask about this question, a mark-scheme step, or a concept you "
        "want explained further. The chat starts fresh on every question."
    )

    messages = st.session_state.get("dojo_chat_messages", [])

    # Keep the conversation in its own scrollable pane so a longer chat does
    # not push the question off-screen.
    with st.container(height=560, border=True):
        if not messages:
            st.caption("Your conversation about this question will appear here.")
        for message in messages:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])

    prompt = st.chat_input(
        "Ask DOJO about this question...",
        key=f"dojo_chat_input_{question.get('question_id', 'unknown')}",
    )

    if not prompt:
        return

    messages.append({
        "role": "user",
        "content": prompt,
    })
    st.session_state.dojo_chat_messages = messages

    with st.spinner("DOJO is thinking..."):
        try:
            answer = ask_dojo_tutor(question, messages)
        except Exception as exc:
            st.error(str(exc))
            return

    messages.append({
        "role": "assistant",
        "content": answer,
    })
    st.session_state.dojo_chat_messages = messages
    st.rerun()


# ============================================================
# PERSISTENT SESSION STORAGE
# ============================================================

def build_session_payload():
    """Build the completed-session record used for download and persistence."""
    return {
        "session_id": st.session_state.get("session_id"),
        "learner_username": st.session_state.get("learner_username"),
        "session_started_at": st.session_state.get("session_started_at"),
        "session_finished_at": st.session_state.get("session_finished_at"),
        "session_outcome": st.session_state.get("session_outcome"),
        "events": st.session_state.get("events", []),
        "attempt_summaries": st.session_state.get("attempt_summaries", []),
    }


def _part_key(part):
    return "__whole_question__" if part is None else str(part)


def _part_from_key(key):
    return None if key == "__whole_question__" else key


def _encode_part_map(mapping):
    return {
        _part_key(key): value
        for key, value in (mapping or {}).items()
    }


def _decode_part_map(mapping):
    return {
        _part_from_key(key): value
        for key, value in (mapping or {}).items()
    }


def _seconds_since(timestamp):
    if not timestamp:
        return 0.0
    try:
        then = datetime.fromisoformat(timestamp)
        return max(0.0, (datetime.now() - then).total_seconds())
    except Exception:
        return 0.0


def build_active_session_payload():
    """Snapshot enough state to resume the exact unfinished question."""
    attempt = st.session_state.get("attempt")
    attempt_snapshot = None
    if attempt:
        attempt_snapshot = {
            "attempt_id": attempt.get("attempt_id"),
            "question_id": attempt.get("question_id"),
            "question_number": attempt.get("question_number"),
            "session_total": attempt.get("session_total"),
            "started_at": attempt.get("started_at"),
            "events": attempt.get("events", []),
            "event_index": attempt.get("event_index", 0),
        }

    history = []
    for entry in st.session_state.get("question_history", []):
        question = entry.get("question", {})
        history.append({
            "question_id": str(question.get("question_id", "unknown")),
            "phase_label": entry.get("phase_label"),
            "display_number": entry.get("display_number"),
            "display_total": entry.get("display_total"),
        })

    current_question = st.session_state.get("current_question")
    current_question_id = None
    if current_question:
        current_question_id = str(
            current_question.get("question_id", "unknown")
        )

    return {
        "session_id": st.session_state.get("session_id"),
        "learner_username": st.session_state.get("learner_username"),
        "session_started_at": st.session_state.get("session_started_at"),
        "session_finished_at": None,
        "session_outcome": None,
        "events": st.session_state.get("events", []),
        "attempt_summaries": st.session_state.get("attempt_summaries", []),
        "active_state": {
            "current_question_id": current_question_id,
            "phase_label": st.session_state.get("phase_label"),
            "display_number": st.session_state.get("display_number"),
            "display_total": st.session_state.get("display_total"),
            "reveal_state": _encode_part_map(
                st.session_state.get("reveal_state", {})
            ),
            "check_counts": _encode_part_map(
                st.session_state.get("check_counts", {})
            ),
            "last_check_correct": _encode_part_map(
                st.session_state.get("last_check_correct", {})
            ),
            "solution_seen": _encode_part_map(
                st.session_state.get("solution_seen", {})
            ),
            "check_pending_part": _part_key(
                st.session_state.get("check_pending_part")
                if st.session_state.get("check_pending_part") != "__none__"
                else "__none__"
            ),
            "attempt": attempt_snapshot,
            "diagnostic_question_ids": [
                str(question.get("question_id", "unknown"))
                for question in st.session_state.get(
                    "diagnostic_questions", []
                )
            ],
            "full_diagnostic_question_ids": list(
                st.session_state.get("full_diagnostic_question_ids", set())
            ),
            "diagnostic_total_count": st.session_state.get(
                "diagnostic_total_count", 0
            ),
            "diagnostic_completed_before_session": st.session_state.get(
                "diagnostic_completed_before_session", 0
            ),
            "diagnostic_index": st.session_state.get("diagnostic_index", 0),
            "diagnostic_question_number": st.session_state.get(
                "diagnostic_question_number", 0
            ),
            "adaptive_question_number": st.session_state.get(
                "adaptive_question_number", 0
            ),
            "adaptive_phase_announced": st.session_state.get(
                "adaptive_phase_announced", False
            ),
            "show_adaptive_message": st.session_state.get(
                "show_adaptive_message", False
            ),
            "attempted_or_queued_ids": list(
                st.session_state.get("attempted_or_queued_ids", set())
            ),
            "question_history": history,
            "history_index": st.session_state.get("history_index"),
        },
    }


def _supabase_request(path, method="GET", data=None, prefer=None):
    try:
        supabase_url = str(st.secrets["SUPABASE_URL"]).rstrip("/")
        secret_key = str(st.secrets["SUPABASE_SECRET_KEY"])
    except Exception as exc:
        raise RuntimeError(
            f"Supabase credentials are unavailable: {exc}"
        ) from exc

    headers = {
        "apikey": secret_key,
        "Authorization": f"Bearer {secret_key}",
        "Accept": "application/json",
    }
    encoded = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        encoded = json.dumps(data, ensure_ascii=False).encode("utf-8")
    if prefer:
        headers["Prefer"] = prefer

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{path}",
        data=encoded,
        method=method,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase returned HTTP {exc.code}: {body}"
        ) from exc
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc


def save_session_to_supabase():
    """Persist one completed DOJO session to Supabase."""
    payload = build_session_payload()
    row = {
        "session_id": payload["session_id"],
        "learner_username": payload["learner_username"],
        "started_at": payload["session_started_at"],
        "finished_at": payload["session_finished_at"],
        "session_data": payload,
    }

    try:
        _supabase_request(
            "dojo_sessions",
            method="POST",
            data=row,
            prefer="resolution=merge-duplicates,return=minimal",
        )
    except Exception as exc:
        st.session_state.database_save_status = "failed"
        st.session_state.database_save_error = str(exc)
        return False

    st.session_state.database_save_status = "saved"
    st.session_state.database_save_error = None
    return True


def save_active_session_to_supabase():
    """Upsert the unfinished session so a browser refresh can resume it."""
    if (
        not st.session_state.get("started")
        or st.session_state.get("finished")
        or not st.session_state.get("session_id")
        or not st.session_state.get("learner_username")
    ):
        return False

    payload = build_active_session_payload()
    row = {
        "session_id": payload["session_id"],
        "learner_username": payload["learner_username"],
        "started_at": payload["session_started_at"],
        "finished_at": None,
        "session_data": payload,
    }

    try:
        _supabase_request(
            "dojo_sessions",
            method="POST",
            data=row,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        st.session_state.active_save_error = None
        return True
    except Exception as exc:
        # Do not interrupt the student's work because a background snapshot
        # failed. The completed-session save still reports failures explicitly.
        st.session_state.active_save_error = str(exc)
        return False


def normalise_username(raw_username):
    username = str(raw_username or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_-]{3,24}", username):
        return None
    return username


def load_learner_session_data(username):
    """Return completed saved sessions for one learner, oldest first."""
    query = urllib.parse.urlencode({
        "select": "session_data",
        "learner_username": f"eq.{username}",
        "finished_at": "not.is.null",
        "order": "started_at.asc",
    })
    body = _supabase_request(f"dojo_sessions?{query}")
    rows = json.loads(body or "[]")
    return [
        row.get("session_data", {})
        for row in rows
        if isinstance(row, dict)
        and isinstance(row.get("session_data"), dict)
    ]


def load_latest_active_session(username):
    """Return the learner's newest unfinished session, if one exists."""
    query = urllib.parse.urlencode({
        "select": "session_data",
        "learner_username": f"eq.{username}",
        "finished_at": "is.null",
        "order": "started_at.desc",
        "limit": "1",
    })
    body = _supabase_request(f"dojo_sessions?{query}")
    rows = json.loads(body or "[]")
    if not rows:
        return None
    payload = rows[0].get("session_data")
    return payload if isinstance(payload, dict) else None


def flatten_attempt_summaries(saved_sessions):
    summaries = []
    for session in saved_sessions:
        session_summaries = session.get("attempt_summaries", [])
        if isinstance(session_summaries, list):
            summaries.extend(
                item for item in session_summaries
                if isinstance(item, dict)
            )
    return summaries


def restore_active_session(payload, historical_attempt_summaries):
    """Restore the exact unfinished session/question after a refresh."""
    questions = load_question_bank()
    by_id = {
        str(question.get("question_id", "unknown")): question
        for question in questions
    }
    active = payload.get("active_state", {})
    current_question_id = active.get("current_question_id")
    current_question = by_id.get(str(current_question_id))

    if current_question is None:
        raise RuntimeError(
            "The saved unfinished question is no longer in the question bank."
        )

    diagnostic_questions = [
        by_id[question_id]
        for question_id in active.get("diagnostic_question_ids", [])
        if question_id in by_id
    ]

    history = []
    for saved_entry in active.get("question_history", []):
        question = by_id.get(str(saved_entry.get("question_id")))
        if question:
            history.append({
                "question": question,
                "phase_label": saved_entry.get("phase_label"),
                "display_number": saved_entry.get("display_number"),
                "display_total": saved_entry.get("display_total"),
            })

    attempt_snapshot = active.get("attempt")
    restored_attempt = None
    if attempt_snapshot:
        started_at = attempt_snapshot.get("started_at")
        elapsed = _seconds_since(started_at)
        now_perf = perf_counter()

        events = list(attempt_snapshot.get("events", []))
        previous_elapsed = 0.0
        if events:
            previous_elapsed = float(
                events[-1].get("seconds_since_question_started", 0.0) or 0.0
            )

        restored_attempt = {
            "attempt_id": attempt_snapshot.get("attempt_id"),
            "question_id": attempt_snapshot.get("question_id"),
            "question_number": attempt_snapshot.get("question_number"),
            "session_total": attempt_snapshot.get("session_total"),
            "started_at": started_at,
            "started_perf": now_perf - elapsed,
            "last_event_perf": now_perf - max(
                0.0, elapsed - previous_elapsed
            ),
            "events": events,
            "event_index": attempt_snapshot.get(
                "event_index", len(events)
            ),
        }

    session_started_at = payload.get("session_started_at")
    session_elapsed = _seconds_since(session_started_at)

    st.session_state.clear()
    st.session_state.started = True
    st.session_state.finished = False
    st.session_state.learner_username = payload.get("learner_username")
    st.session_state.returning_learner = True
    st.session_state.historical_attempt_summaries = list(
        historical_attempt_summaries or []
    )
    st.session_state.session_id = payload.get("session_id")
    st.session_state.session_started_at = session_started_at
    st.session_state.session_started_perf = (
        perf_counter() - session_elapsed
    )
    st.session_state.questions = questions
    st.session_state.diagnostic_questions = diagnostic_questions
    st.session_state.full_diagnostic_question_ids = set(
        active.get("full_diagnostic_question_ids", [])
    )
    st.session_state.diagnostic_total_count = active.get(
        "diagnostic_total_count", 0
    )
    st.session_state.diagnostic_completed_before_session = active.get(
        "diagnostic_completed_before_session", 0
    )
    st.session_state.diagnostic_index = active.get("diagnostic_index", 0)
    st.session_state.diagnostic_question_number = active.get(
        "diagnostic_question_number", 0
    )
    st.session_state.adaptive_question_number = active.get(
        "adaptive_question_number", 0
    )
    st.session_state.adaptive_phase_announced = active.get(
        "adaptive_phase_announced", False
    )
    st.session_state.show_adaptive_message = False
    st.session_state.attempted_or_queued_ids = set(
        active.get("attempted_or_queued_ids", [])
    )
    st.session_state.events = list(payload.get("events", []))
    st.session_state.attempt_summaries = list(
        payload.get("attempt_summaries", [])
    )
    st.session_state.question_history = history
    st.session_state.history_index = active.get("history_index")
    st.session_state.database_save_status = "not_saved"
    st.session_state.database_save_error = None
    st.session_state.active_save_error = None
    st.session_state.session_finished_at = None
    st.session_state.session_outcome = None

    st.session_state.current_question = current_question
    st.session_state.phase_label = active.get("phase_label")
    st.session_state.display_number = active.get("display_number")
    st.session_state.display_total = active.get("display_total")
    st.session_state.reveal_state = _decode_part_map(
        active.get("reveal_state", {})
    )
    st.session_state.check_counts = _decode_part_map(
        active.get("check_counts", {})
    )
    st.session_state.last_check_correct = _decode_part_map(
        active.get("last_check_correct", {})
    )
    st.session_state.solution_seen = _decode_part_map(
        active.get("solution_seen", {})
    )

    pending = active.get("check_pending_part", "__none__")
    if pending == "__whole_question__":
        pending = None
    elif pending == "__none__":
        pending = "__none__"
    st.session_state.check_pending_part = pending
    st.session_state.attempt = restored_attempt
    st.session_state.dojo_chat_question_id = str(
        current_question.get("question_id", "unknown")
    )
    st.session_state.dojo_chat_messages = []


def begin_for_username(raw_username, mode):
    username = normalise_username(raw_username)
    if username is None:
        if mode != "auto":
            st.error(
                "Use 3–24 characters: lowercase letters, numbers, "
                "hyphens or underscores."
            )
        return False

    try:
        saved_sessions = load_learner_session_data(username)
        active_session = load_latest_active_session(username)
    except Exception as exc:
        if mode != "auto":
            st.error(f"Could not check that username: {exc}")
        return False

    exists = bool(saved_sessions or active_session)

    if mode == "create" and exists:
        st.error(
            "That username already exists. Use Log in instead, "
            "or choose another username."
        )
        return False

    if mode == "login" and not exists:
        st.error(
            "No saved practice was found for that username. "
            "Check the spelling, or create it as a new username."
        )
        return False

    if mode in {"create", "login"}:
        st.query_params["user"] = username

    prior_attempts = flatten_attempt_summaries(saved_sessions)

    if active_session:
        try:
            restore_active_session(active_session, prior_attempts)
        except Exception as exc:
            if mode != "auto":
                st.error(f"Could not resume the unfinished session: {exc}")
            return False
    else:
        start_session(
            learner_username=username,
            historical_attempt_summaries=prior_attempts,
            returning_learner=bool(saved_sessions),
        )

    return True


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
    st.session_state.dojo_chat_question_id = str(
        question.get("question_id", "unknown")
    )
    st.session_state.dojo_chat_messages = []
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
    save_active_session_to_supabase()


def select_and_initialise_next_question():
    questions = st.session_state.questions
    diagnostic = st.session_state.diagnostic_questions

    if st.session_state.diagnostic_index < len(diagnostic):
        question = diagnostic[st.session_state.diagnostic_index]
        st.session_state.diagnostic_index += 1
        st.session_state.diagnostic_question_number += 1

        overall_position = (
            st.session_state.get("diagnostic_completed_before_session", 0)
            + st.session_state.diagnostic_question_number
        )
        overall_total = st.session_state.get(
            "diagnostic_total_count",
            len(diagnostic),
        )

        question_id = str(question.get("question_id", "unknown"))
        st.session_state.attempted_or_queued_ids.add(question_id)

        record_selection_event(
            question,
            "diagnostic",
            diagnostic_position=overall_position,
            diagnostic_total=overall_total,
        )

        initialise_question(
            question,
            overall_position,
            overall_total,
            "Diagnostic",
        )
        return

    if not st.session_state.adaptive_phase_announced:
        st.session_state.adaptive_phase_announced = True
        st.session_state.show_adaptive_message = True
        record_session_event(
            "adaptive_phase_started",
            diagnostic_questions_completed=st.session_state.get(
                "diagnostic_total_count",
                st.session_state.diagnostic_question_number,
            ),
        )

    attempts = (
        st.session_state.get("historical_attempt_summaries", [])
        + attempt_summaries()
    )
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


def start_session(
    learner_username,
    historical_attempt_summaries=None,
    returning_learner=False,
):
    questions = load_question_bank()
    historical_attempt_summaries = list(
        historical_attempt_summaries or []
    )

    full_diagnostic = build_diagnostic_set(questions)
    full_diagnostic_ids = {
        str(question.get("question_id", "unknown"))
        for question in full_diagnostic
    }

    completed_historical_diagnostic_ids = {
        str(summary.get("question_id"))
        for summary in historical_attempt_summaries
        if summary.get("outcome") == "completed"
        and str(summary.get("question_id")) in full_diagnostic_ids
    }

    diagnostic = [
        question
        for question in full_diagnostic
        if str(question.get("question_id", "unknown"))
        not in completed_historical_diagnostic_ids
    ]

    session_id = make_id("session")

    historical_question_ids = {
        str(summary.get("question_id"))
        for summary in historical_attempt_summaries
        if summary.get("question_id") is not None
    }

    diagnostic_complete_before_session = (
        len(completed_historical_diagnostic_ids) == len(full_diagnostic)
    )

    st.session_state.clear()
    st.session_state.started = True
    st.session_state.finished = False
    st.session_state.learner_username = learner_username
    st.session_state.returning_learner = returning_learner
    st.session_state.historical_attempt_summaries = (
        historical_attempt_summaries
    )
    st.session_state.session_id = session_id
    st.session_state.session_started_at = now_iso()
    st.session_state.session_started_perf = perf_counter()
    st.session_state.questions = questions
    st.session_state.diagnostic_questions = diagnostic
    st.session_state.full_diagnostic_question_ids = full_diagnostic_ids
    st.session_state.diagnostic_total_count = len(full_diagnostic)
    st.session_state.diagnostic_completed_before_session = len(
        completed_historical_diagnostic_ids
    )
    st.session_state.diagnostic_index = 0
    st.session_state.diagnostic_question_number = 0
    st.session_state.adaptive_question_number = 0
    st.session_state.adaptive_phase_announced = (
        diagnostic_complete_before_session
    )
    st.session_state.show_adaptive_message = (
        returning_learner and diagnostic_complete_before_session
    )
    st.session_state.attempted_or_queued_ids = set(historical_question_ids)
    st.session_state.events = []
    st.session_state.attempt_summaries = []
    st.session_state.question_history = []
    st.session_state.history_index = None
    st.session_state.database_save_status = "not_saved"
    st.session_state.database_save_error = None
    st.session_state.active_save_error = None
    st.session_state.session_finished_at = None
    st.session_state.session_outcome = None
    st.session_state.current_question = None
    st.session_state.attempt = None

    diagnostic_ids = [
        str(question.get("question_id", "unknown"))
        for question in diagnostic
    ]
    record_session_event(
        "session_started",
        learner_username=learner_username,
        bank_question_count=len(questions),
        diagnostic_question_count=len(full_diagnostic),
        diagnostic_questions_already_completed=len(
            completed_historical_diagnostic_ids
        ),
        diagnostic_questions_remaining=len(diagnostic),
        selection_method=(
            "adaptive_from_learner_history_v1"
            if diagnostic_complete_before_session
            else "resume_diagnostic_then_adaptive_v1"
            if returning_learner
            else "diagnostic_then_adaptive_v1"
        ),
        diagnostic_question_order=diagnostic_ids,
        historical_attempt_summary_count=len(historical_attempt_summaries),
    )
    select_and_initialise_next_question()


def move_to_next_question(outcome):
    question = st.session_state.current_question
    history_entry = {
        "question": question,
        "phase_label": st.session_state.phase_label,
        "display_number": st.session_state.display_number,
        "display_total": st.session_state.display_total,
    }

    finish_attempt(outcome)
    st.session_state.question_history.append(history_entry)
    st.session_state.history_index = None
    select_and_initialise_next_question()
    st.rerun()


def render_read_only_question(entry):
    question = entry["question"]
    phase = entry["phase_label"]
    number = entry["display_number"]
    total = entry["display_total"]
    total_marks = question.get("solution", {}).get("total_marks")

    st.caption("PREVIOUS QUESTION — READ ONLY")
    if total is None:
        st.caption(f"{phase.upper()} QUESTION {number}")
    else:
        st.caption(f"{phase.upper()} QUESTION {number} OF {total}")
    if total_marks is not None:
        st.caption(f"{total_marks} marks")

    render_display_blocks(
        question.get("question", {}).get("display_blocks", [])
    )
    st.info(
        "Looking back does not change your recorded attempt or DOJO's "
        "question selection."
    )

    markscheme_tab, solution_tab = st.tabs(["Mark scheme", "Full solution"])
    with markscheme_tab:
        for part in (get_question_parts(question) or [None]):
            if part is not None:
                st.markdown(f"### Part {str(part).upper()}")
            steps = get_solution_steps(question, part)
            if not steps:
                st.info("No mark scheme steps are stored for this part.")
            for step in steps:
                render_step(step)

    with solution_tab:
        render_full_solution(question)

    st.divider()
    index = st.session_state.history_index
    earlier_col, current_col = st.columns(2)

    if index > 0:
        if earlier_col.button("← Earlier question", use_container_width=True):
            st.session_state.history_index -= 1
            st.rerun()

    if current_col.button(
        "Return to current question →",
        type="primary",
        use_container_width=True,
    ):
        st.session_state.history_index = None
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

    diagnostic_ids = st.session_state.get(
        "full_diagnostic_question_ids",
        set(),
    )
    completed_this_session = {
        str(summary.get("question_id"))
        for summary in attempt_summaries()
        if summary.get("outcome") == "completed"
        and str(summary.get("question_id")) in diagnostic_ids
    }
    diagnostic_questions_completed = min(
        st.session_state.get("diagnostic_total_count", 0),
        st.session_state.get("diagnostic_completed_before_session", 0)
        + len(completed_this_session),
    )

    record_session_event(
        "session_ended",
        duration_seconds=duration,
        outcome=outcome,
        questions_attempted=len(attempt_summaries()),
        diagnostic_questions_completed=diagnostic_questions_completed,
    )

    st.session_state.session_outcome = outcome
    st.session_state.session_finished_at = now_iso()

    save_session_to_supabase()

    st.session_state.finished = True
    st.session_state.current_question = None
    st.session_state.attempt = None


# ============================================================
# RENDERING
# ============================================================

def render_step(step, *, show_heading=True):
    step_number=step.get("step","?"); description=step.get("description",""); display=step.get("display",{})
    if show_heading: st.markdown(f"**Step {step_number}: {description}**")
    render_display_blocks(display.get("working_blocks",[]))
    for note_blocks in display.get("student_mark_note_blocks",[]):
        text_parts=[b.get("content","") for b in note_blocks if b.get("type")!="spacer"]
        if text_parts: st.caption(" ".join(text_parts))
    fallback=display.get("fallback_mark_caption")
    if fallback: st.caption(fallback)
    for concept_blocks in display.get("concept_blocks",[]):
        st.markdown("**Why this matters:**"); render_display_blocks(concept_blocks)
    for note_blocks in display.get("answer_note_blocks",[]):
        st.caption("Answer note:"); render_display_blocks(note_blocks)
    alternatives=display.get("alternative_blocks",[])
    if alternatives:
        st.markdown("**Alternative approach:**")
        for route_blocks in alternatives: render_display_blocks(route_blocks)


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
                render_step(step, show_heading=False)
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
                save_active_session_to_supabase()
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
        save_active_session_to_supabase()
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

    st.session_state.check_pending_part = part

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

    save_active_session_to_supabase()


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
    save_active_session_to_supabase()


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

        check_button_label = (
            "Confirm my working"
            if is_show_that_task(question, part)
            else "Compare / check my work"
        )

        if st.button(
            check_button_label,
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
        st.markdown("### Check your working")
        st.write(
            "Because the final result is already given, this check is about "
            "whether you produced a valid route to it yourself."
        )
        st.write(
            "You can use the mark scheme afterwards if you want to compare "
            "individual steps."
        )
        st.write(
            "**Did you reach the stated result using valid working of your own?**"
        )
    else:
        st.markdown("### Compare your answer")
        answer = (
            get_part_answer(question, part)
            if is_multipart(question)
            else question.get("answer", {})
        )
        render_display_blocks(get_answer_display_blocks(question, part))
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
        save_active_session_to_supabase()
        st.rerun()

    if st.session_state.solution_seen[part]:
        render_full_solution(question, part)


def render_session_download():
    if not st.session_state.get("started"):
        return

    payload = build_session_payload()

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
        if st.session_state.get("returning_learner"):
            st.success(
                "Welcome back. DOJO is continuing from your previous practice."
            )
        else:
            st.success(
                "Diagnostic complete. DOJO is now choosing questions from "
                "what has happened in this session."
            )
        st.session_state.show_adaptive_message = False

    if (
        st.session_state.get("returning_learner")
        and st.session_state.get("diagnostic_questions")
        and st.session_state.get("diagnostic_index", 0) == 1
    ):
        st.info(
            "Welcome back. You have not finished the diagnostic yet, "
            "so DOJO is continuing it from where you left off."
        )

    if total is None:
        st.caption(f"{phase.upper()} QUESTION {number}")
    else:
        st.caption(f"{phase.upper()} QUESTION {number} OF {total}")

    if total_marks is not None:
        st.caption(f"{total_marks} marks")

    # Desktop practice workspace: the question/solution tools and Ask DOJO
    # remain visible side by side. Each side scrolls independently.
    question_col, chat_col = st.columns([1.15, 0.85], gap="large")

    with question_col:
        with st.container(height=700, border=True):
            question_blocks = question.get("question", {}).get("display_blocks", [])
            if question_blocks:
                render_display_blocks(question_blocks)
            else:
                st.error(
                    "This question has not been pre-rendered. "
                    "Run render_question_bank.py before deployment."
                )

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

    with chat_col:
        render_dojo_chat(question)

    st.divider()

    last_results = st.session_state.last_check_correct
    if any(result is True for result in last_results.values()):
        st.success("Recorded as correct.")
    elif any(result is False for result in last_results.values()):
        st.warning(
            "Recorded as not correct. Keep working, check again, "
            "or inspect the mark scheme."
        )

    if st.session_state.get("question_history"):
        if st.button("← Previous question", use_container_width=True):
            st.session_state.history_index = (
                len(st.session_state.question_history) - 1
            )
            st.rerun()

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

    save_status = st.session_state.get("database_save_status")
    if save_status == "saved":
        st.caption("Session data saved automatically.")
    elif save_status == "failed":
        st.warning(
            "Automatic session saving failed. Please use the sidebar download "
            "as a backup for this session."
        )
        error_detail = st.session_state.get("database_save_error")
        if error_detail:
            st.error(f"Database error: {error_detail}")

    st.write(
        f"Questions attempted: **{len(st.session_state.attempt_summaries)}**"
    )
    st.write(
        "Use **Download session log** in the sidebar if you want to "
        "keep this beta session data."
    )

    if st.button("Start another session", type="primary"):
        username = st.session_state.get("learner_username")
        try:
            saved_sessions = load_learner_session_data(username)
            prior_attempts = flatten_attempt_summaries(saved_sessions)
            start_session(
                learner_username=username,
                historical_attempt_summaries=prior_attempts,
                returning_learner=bool(saved_sessions),
            )
            st.rerun()
        except Exception as exc:
            st.error(f"Could not reload your saved practice: {exc}")

    if st.button("Log out"):
        st.query_params.clear()
        st.session_state.clear()
        st.rerun()


# ============================================================
# APP
# ============================================================

st.set_page_config(
    page_title="DOJO",
    page_icon="🥋",
    layout="wide",
)

st.title("DOJO")
st.caption("A-level Maths Practice — Implicit Differentiation")

if not st.session_state.get("started"):
    remembered_username = st.query_params.get("user")
    if remembered_username:
        if begin_for_username(remembered_username, "auto"):
            st.rerun()

if not st.session_state.get("started"):
    st.write(
        "Work on paper. When you've finished a question or part, use "
        "**Check** to compare your result."
    )
    st.write(
        "New learners begin with a short diagnostic. When you return with "
        "the same username, DOJO continues from your previous practice."
    )

    try:
        bank_count = len(load_question_bank())
        st.caption(f"{bank_count} questions currently available.")
    except Exception as exc:
        st.error(f"Could not load question_bank.json: {exc}")
        st.stop()

    username_input = st.text_input(
        "Username",
        placeholder="e.g. alex03",
        help="3–24 lowercase letters, numbers, hyphens or underscores.",
    )

    create_col, login_col = st.columns(2)

    if create_col.button(
        "Create username",
        type="primary",
        use_container_width=True,
    ):
        begin_for_username(username_input, "create")
        if st.session_state.get("started"):
            st.rerun()

    if login_col.button("Log in", use_container_width=True):
        begin_for_username(username_input, "login")
        if st.session_state.get("started"):
            st.rerun()

    st.caption(
        "Beta note: this browser remembers the username in the page URL "
        "so a refresh can reconnect to the same unfinished practice. "
        "There is no password system yet."
    )
else:
    render_session_download()

    if st.session_state.get("finished"):
        render_finished()
    elif st.session_state.get("history_index") is not None:
        render_read_only_question(
            st.session_state.question_history[
                st.session_state.history_index
            ]
        )
    elif st.session_state.get("current_question") is not None:
        render_question()

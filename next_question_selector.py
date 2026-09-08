"""
DOJO — Next Question Selector V1

Purpose
-------
Choose the next question after DOJO has started collecting learner behaviour.

This selector uses:
    - the current question bank;
    - structural question profiles from the progression engine;
    - core-branch and depth-feature logic from diagnostic_selector_v2.py;
    - factual question-attempt summaries produced by the practice engine.

The selector does not calculate a general ability or mastery score. Instead it
builds a small evidence model from observable behaviour:

    independent_success
        The learner checked successfully without revealing solution material.

    assisted_success
        The learner eventually succeeded, but had already revealed part of the
        mark scheme or full solution.

    unresolved
        The attempt ended without a successful check, or the full solution was
        revealed without later independent evidence.

The selection policy is:

    1. Prefer core branches that have not yet been assessed.
    2. Then revisit branches where the evidence is uncertain or unresolved.
    3. Then extend branches the learner has handled independently.
    4. Within each case, prefer questions that add useful structural novelty
       without making an unnecessarily large jump.

Main function:

    select_next_question(
        questions,
        attempt_summaries,
        exclude_question_ids=None,
    )

The module is intended as an initial adaptive-selection prototype. Its evidence
rules are kept explicit so they can later be revised against real learner data.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import Any, Iterable

from initial_ordering_prototype import build_profile, order_questions
from diagnostic_selector import (
    core_branch,
    depth_features,
)


# ============================================================
# EVIDENCE MODEL
# ============================================================

INDEPENDENT_SUCCESS = "independent_success"
ASSISTED_SUCCESS = "assisted_success"
UNRESOLVED = "unresolved"


@dataclass(frozen=True)
class AttemptEvidence:
    question_id: str
    family: str
    status: str
    first_check_correct: bool | None
    eventually_checked_correct: bool
    incorrect_checks: int
    markscheme_steps_revealed: int
    full_solution_revealed: bool
    duration_seconds: float | None


def _part_summaries(attempt: dict[str, Any]) -> list[dict[str, Any]]:
    summaries = attempt.get("part_summaries") or {}

    if isinstance(summaries, dict):
        return [
            summary
            for summary in summaries.values()
            if isinstance(summary, dict)
        ]

    return []


def _count_markscheme_reveals(attempt: dict[str, Any]) -> int:
    """
    Count selectively revealed mark-scheme steps from the attempt summary.

    Newer summaries use markscheme_steps_revealed. Older prototype summaries
    may not contain this field, in which case the count safely defaults to 0.
    """
    summaries = _part_summaries(attempt)

    if summaries:
        return sum(
            int(summary.get("markscheme_steps_revealed") or 0)
            for summary in summaries
        )

    return int(attempt.get("markscheme_steps_revealed") or 0)


def _full_solution_revealed(attempt: dict[str, Any]) -> bool:
    summaries = _part_summaries(attempt)

    if summaries:
        return any(
            bool(summary.get("solution_revealed", False))
            for summary in summaries
        )

    return bool(attempt.get("solution_revealed", False))


def _eventually_correct(attempt: dict[str, Any]) -> bool:
    summaries = _part_summaries(attempt)

    if summaries:
        return all(
            bool(summary.get("eventually_checked_correct", False))
            for summary in summaries
        )

    return bool(attempt.get("eventually_checked_correct", False))


def _first_check_correct(attempt: dict[str, Any]) -> bool | None:
    summaries = _part_summaries(attempt)

    if summaries:
        values = [
            summary.get("first_check_correct")
            for summary in summaries
        ]

        if not values:
            return None

        if all(value is True for value in values):
            return True

        if any(value is False for value in values):
            return False

        return None

    return attempt.get("first_check_correct")


def _incorrect_checks(attempt: dict[str, Any]) -> int:
    summaries = _part_summaries(attempt)

    if summaries:
        return sum(
            int(summary.get("incorrect_checks") or 0)
            for summary in summaries
        )

    return int(attempt.get("incorrect_checks") or 0)


def classify_attempt(
    attempt: dict[str, Any],
    question_lookup: dict[str, dict[str, Any]],
) -> AttemptEvidence | None:
    """
    Convert one factual attempt summary into a small evidence classification.
    """
    question_id = str(attempt.get("question_id", ""))

    if question_id not in question_lookup:
        return None

    question = question_lookup[question_id]
    family = core_branch(question)

    eventually_correct = _eventually_correct(attempt)
    first_correct = _first_check_correct(attempt)
    incorrect_checks = _incorrect_checks(attempt)
    reveals = _count_markscheme_reveals(attempt)
    full_solution = _full_solution_revealed(attempt)

    if eventually_correct and reveals == 0 and not full_solution:
        status = INDEPENDENT_SUCCESS
    elif eventually_correct:
        status = ASSISTED_SUCCESS
    else:
        status = UNRESOLVED

    return AttemptEvidence(
        question_id=question_id,
        family=family,
        status=status,
        first_check_correct=first_correct,
        eventually_checked_correct=eventually_correct,
        incorrect_checks=incorrect_checks,
        markscheme_steps_revealed=reveals,
        full_solution_revealed=full_solution,
        duration_seconds=attempt.get("duration_seconds"),
    )


# ============================================================
# LEARNER EVIDENCE SUMMARY
# ============================================================

def build_evidence_summary(
    questions: Iterable[dict[str, Any]],
    attempt_summaries: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    """
    Summarise observed evidence by core branch and structural depth feature.
    """
    questions = list(questions)
    attempts = list(attempt_summaries)

    question_lookup = {
        str(question.get("question_id")): question
        for question in questions
        if question.get("question_id") is not None
    }

    evidence_items = []

    for attempt in attempts:
        evidence = classify_attempt(attempt, question_lookup)

        if evidence is not None:
            evidence_items.append(evidence)

    family_evidence = defaultdict(list)
    feature_evidence = defaultdict(list)

    for evidence in evidence_items:
        family_evidence[evidence.family].append(evidence)

        question = question_lookup[evidence.question_id]

        for feature in depth_features(question):
            feature_evidence[feature].append(evidence.status)

    return {
        "attempts": evidence_items,
        "family_evidence": dict(family_evidence),
        "feature_evidence": dict(feature_evidence),
    }


def family_state(evidence_items: Iterable[AttemptEvidence]) -> str:
    """
    Return the current evidence state for one core branch.

    unassessed
        No attempt evidence exists.

    unresolved
        At least one attempt in the family ended unresolved and there is no
        later independent success that clearly supersedes it.

    uncertain
        The learner has succeeded, but only with assistance or mixed outcomes.

    strong
        The most recent evidence is independent success and there is no later
        assisted/unresolved attempt.
    """
    evidence_items = list(evidence_items)

    if not evidence_items:
        return "unassessed"

    latest = evidence_items[-1]

    if latest.status == UNRESOLVED:
        return "unresolved"

    if latest.status == ASSISTED_SUCCESS:
        return "uncertain"

    return "strong"


# ============================================================
# CANDIDATE ANALYSIS
# ============================================================

def _attempted_question_ids(
    attempt_summaries: Iterable[dict[str, Any]],
) -> set[str]:
    return {
        str(attempt.get("question_id"))
        for attempt in attempt_summaries
        if attempt.get("question_id") is not None
    }


def _features_seen_with_status(
    evidence_summary: dict[str, Any],
    wanted_status: str,
) -> set[str]:
    result = set()

    for feature, statuses in evidence_summary["feature_evidence"].items():
        if wanted_status in statuses:
            result.add(feature)

    return result


def _candidate_priority_group(
    question: dict[str, Any],
    evidence_summary: dict[str, Any],
) -> int:
    """
    Lower group number means stronger selection priority.

    0 = unassessed family
    1 = unresolved family
    2 = uncertain family
    3 = strong family extension
    """
    family = core_branch(question)
    family_items = evidence_summary["family_evidence"].get(family, [])
    state = family_state(family_items)

    return {
        "unassessed": 0,
        "unresolved": 1,
        "uncertain": 2,
        "strong": 3,
    }[state]


def _candidate_novelty(
    question: dict[str, Any],
    evidence_summary: dict[str, Any],
) -> tuple[int, int]:
    """
    Return:
        (new_feature_count, independently_mastered_feature_count)

    New features are useful when extending a strong learner.
    Independently demonstrated features reduce the size of the conceptual jump.
    """
    features = depth_features(question)

    all_seen = set(evidence_summary["feature_evidence"].keys())
    independently_seen = _features_seen_with_status(
        evidence_summary,
        INDEPENDENT_SUCCESS,
    )

    new_features = features - all_seen
    familiar_features = features & independently_seen

    return len(new_features), len(familiar_features)


def _candidate_key(
    question: dict[str, Any],
    evidence_summary: dict[str, Any],
    progression_positions: dict[str, int],
) -> tuple:
    """
    Rank eligible next-question candidates.

    The broad evidence state is considered first. Within that state:

    - unresolved/uncertain families favour a small structural jump;
    - strong families favour some novelty while retaining familiar structure;
    - the existing progression order is the final workload tie-break.
    """
    group = _candidate_priority_group(question, evidence_summary)
    new_count, familiar_count = _candidate_novelty(
        question,
        evidence_summary,
    )

    question_id = str(question.get("question_id", "unknown"))
    progression_position = progression_positions.get(
        question_id,
        10**9,
    )

    if group in (1, 2):
        # When evidence is weak, prefer a nearby representative rather than
        # immediately increasing novelty.
        variation_key = (
            new_count,
            -familiar_count,
        )
    elif group == 3:
        # When the family is strong, seek useful novelty while keeping enough
        # familiar structure for the question to remain a natural extension.
        variation_key = (
            0 if new_count > 0 else 1,
            new_count,
            -familiar_count,
        )
    else:
        # For unassessed families, begin with their earlier/basic forms.
        variation_key = (
            progression_position,
        )

    return (
        group,
        *variation_key,
        progression_position,
        question_id,
    )


# ============================================================
# PUBLIC SELECTION API
# ============================================================

def select_next_question(
    questions: Iterable[dict[str, Any]],
    attempt_summaries: Iterable[dict[str, Any]],
    exclude_question_ids: Iterable[str] | None = None,
) -> dict[str, Any] | None:
    """
    Select the next unattempted question.

    Parameters
    ----------
    questions:
        Full current question bank.

    attempt_summaries:
        Factual attempt-summary dictionaries collected by the practice engine.

    exclude_question_ids:
        Optional extra IDs that should not currently be selected, for example
        questions already queued in the current session.

    Returns
    -------
    The selected question dictionary, or None when no eligible question remains.
    """
    questions = list(questions)
    attempts = list(attempt_summaries)

    if not questions:
        return None

    attempted = _attempted_question_ids(attempts)
    excluded = {
        str(question_id)
        for question_id in (exclude_question_ids or [])
    }

    candidates = [
        question
        for question in questions
        if str(question.get("question_id")) not in attempted
        and str(question.get("question_id")) not in excluded
    ]

    if not candidates:
        return None

    evidence_summary = build_evidence_summary(
        questions,
        attempts,
    )

    ordered_bank = order_questions(questions)
    progression_positions = {
        str(question.get("question_id")): position
        for position, question in enumerate(ordered_bank)
    }

    candidates.sort(
        key=lambda question: _candidate_key(
            question,
            evidence_summary,
            progression_positions,
        )
    )

    return candidates[0]


# ============================================================
# DEVELOPER INSPECTION
# ============================================================

def rank_next_question_candidates(
    questions: Iterable[dict[str, Any]],
    attempt_summaries: Iterable[dict[str, Any]],
    exclude_question_ids: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Return all currently eligible candidates in selection order together with
    the evidence used to rank them.
    """
    questions = list(questions)
    attempts = list(attempt_summaries)

    attempted = _attempted_question_ids(attempts)
    excluded = {
        str(question_id)
        for question_id in (exclude_question_ids or [])
    }

    evidence_summary = build_evidence_summary(
        questions,
        attempts,
    )

    ordered_bank = order_questions(questions)
    progression_positions = {
        str(question.get("question_id")): position
        for position, question in enumerate(ordered_bank)
    }

    candidates = [
        question
        for question in questions
        if str(question.get("question_id")) not in attempted
        and str(question.get("question_id")) not in excluded
    ]

    candidates.sort(
        key=lambda question: _candidate_key(
            question,
            evidence_summary,
            progression_positions,
        )
    )

    report = []

    for question in candidates:
        family = core_branch(question)
        family_items = evidence_summary["family_evidence"].get(
            family,
            [],
        )
        new_count, familiar_count = _candidate_novelty(
            question,
            evidence_summary,
        )

        report.append({
            "question_id": question.get("question_id", "unknown"),
            "branch": family,
            "family_state": family_state(family_items),
            "priority_group": _candidate_priority_group(
                question,
                evidence_summary,
            ),
            "new_feature_count": new_count,
            "familiar_independent_feature_count": familiar_count,
            "depth_features": sorted(
                depth_features(question)
            ),
            "progression_position": progression_positions.get(
                str(question.get("question_id")),
            ),
            "profile": asdict(build_profile(question)),
        })

    return report


def explain_current_evidence(
    questions: Iterable[dict[str, Any]],
    attempt_summaries: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    """
    Return the current learner evidence in a developer-readable structure.
    """
    summary = build_evidence_summary(
        questions,
        attempt_summaries,
    )

    family_report = []

    for family, items in summary["family_evidence"].items():
        family_report.append({
            "branch": family,
            "state": family_state(items),
            "attempts": [
                asdict(item)
                for item in items
            ],
        })

    return {
        "families": family_report,
        "feature_evidence": {
            feature: list(statuses)
            for feature, statuses
            in summary["feature_evidence"].items()
        },
    }

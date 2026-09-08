"""
DOJO — Diagnostic Selector V2

Purpose
-------
Build a compact initial diagnostic set for a learner with no prior DOJO data.

The selector distinguishes between:

    CORE BRANCH
        The underlying kind of mathematical work being assessed.

    EXTENSIONS / DEPTH
        Additional demands layered on top of the same core branch, such as
        evaluating a derivative at a point, constructing a tangent/normal,
        adding domain restrictions, multipart dependency, or more techniques.

The diagnostic set is designed to sample broad branches before depth. It avoids
treating every distinct task string or every additional complexity feature as a
separate diagnostic category.

The selector reuses the existing progression engine for structural profiles and
least-to-most-complex ordering.

Main function:

    build_diagnostic_set(questions)
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Iterable

from initial_ordering_prototype import build_profile, order_questions


# ============================================================
# CONFIGURATION
# ============================================================

# Maximum extra representatives allowed from a single core branch during the
# initial diagnostic. This prevents one rich branch from consuming the whole
# diagnostic before other branches are sampled.
MAX_REPRESENTATIVES_PER_BRANCH = 2


# Only these kinds of variation are considered strong enough to justify a
# second representative from the same branch during the initial diagnostic.
# They represent a materially different sub-skill rather than simple added
# workload.
BRANCH_VARIATION_FEATURES = {
    "derivative_condition_reasoning",
    "parameter_reasoning",
    "exceptional_case",
    "coordinate_solving",
}


# ============================================================
# TEXT / TASK HELPERS
# ============================================================

def _question_text(question: dict[str, Any]) -> str:
    return str(
        (question.get("question") or {}).get("text", "")
    ).lower()


def _task(question: dict[str, Any]) -> str:
    return str(
        (question.get("generative_structure") or {}).get("task", "")
    ).lower()


def _solution_text(question: dict[str, Any]) -> str:
    solution = question.get("solution") or {}
    chunks = []

    if isinstance(solution.get("parts"), list):
        parts = solution["parts"]
    else:
        parts = [{
            "steps": solution.get("steps", [])
        }]

    for part in parts:
        for step in part.get("steps", []) or []:
            chunks.append(str(step.get("description", "")))
            chunks.append(str(step.get("working", "")))

            for mark in step.get("marks", []) or []:
                chunks.append(str(mark.get("criterion", "")))

    return "\n".join(chunks).lower()


def _combined_text(question: dict[str, Any]) -> str:
    return (
        _question_text(question)
        + "\n"
        + _solution_text(question)
    )


# ============================================================
# CORE BRANCH MODEL
# ============================================================

def core_branch(question: dict[str, Any]) -> str:
    """
    Classify a question by the broad mathematical task that forms its main
    diagnostic identity.

    The branch is intentionally coarser than the stored task label.

    Current generic branches:
        support_coordinate_work
        implicit_derivative
        derivative_condition
        reverse_parameter_reasoning

    The fallback keeps the architecture usable if future banks introduce task
    types that do not match the current implicit-differentiation prototype.
    """
    p = build_profile(question)
    text = _combined_text(question)
    task = _task(question)

    # Parameter/reverse problems are structurally distinct because the learner
    # uses derivative/geometric information to infer unknown constants.
    if p.parameter_reasoning_required:
        return "reverse_parameter_reasoning"

    # Derivative-condition questions use information such as dy/dx = 0 to find
    # locations/coordinates. This is different from simply evaluating dy/dx.
    if (
        "dy/dx = 0" in text
        or "derivative_condition" in task
        or (
            p.coordinate_solving_required
            and p.differentiation_required
            and "condition" in task
        )
    ):
        return "derivative_condition"

    # If the task does not require differentiation, treat it as supporting
    # coordinate/algebra work even if the equation itself contains terms that
    # could later be differentiated.
    if not p.differentiation_required:
        return "support_coordinate_work"

    # Most of the remaining bank belongs to one broad implicit-differentiation
    # branch. Gradient/tangent/normal work is treated as depth on this branch
    # rather than separate branches.
    if p.differentiation_required:
        return "implicit_derivative"

    # Generic fallback for future topics/schemas.
    if p.coordinate_solving_required:
        return "coordinate_work"

    return "unclassified"


# ============================================================
# DEPTH / EXTENSION MODEL
# ============================================================

def depth_features(question: dict[str, Any]) -> set[str]:
    """
    Describe how a question extends its core branch.

    These features help choose representative questions inside a branch but do
    not automatically create new diagnostic branches.
    """
    p = build_profile(question)
    task = _task(question)
    text = _combined_text(question)

    features = set()

    # Mathematical technique variation
    if p.product_rule_required:
        features.add("product_rule")
    if p.chain_rule_required:
        features.add("chain_rule")
    if p.trig_required:
        features.add("trig")
    if p.exponential_required:
        features.add("exponential")
    if p.dy_dx_collection_required:
        features.add("dy_dx_collection")
    if p.method_recognition_required:
        features.add("method_recognition")

    # Structural depth
    if p.part_count > 1:
        features.add("multipart")
    if p.dependent_part_count > 0:
        features.add("dependent_parts")
    if p.domain_restriction_required:
        features.add("domain_restriction")
    if p.multiple_case_handling_required:
        features.add("multiple_case_handling")
    if p.exceptional_case_required:
        features.add("exceptional_case")
    if p.parameter_reasoning_required:
        features.add("parameter_reasoning")

    # Task extensions
    if p.coordinate_solving_required:
        features.add("coordinate_solving")
    if p.line_construction_required:
        features.add("line_construction")

    if "gradient" in task or "gradient" in text:
        features.add("evaluate_gradient")

    if "tangent" in task or "equation of the tangent" in text:
        features.add("tangent_application")

    if "normal" in task or "equation of the normal" in text:
        features.add("normal_application")

    if "dy/dx = 0" in text or "derivative_condition" in task:
        features.add("derivative_condition_reasoning")

    # Broad object/technique richness
    if p.component_count >= 3:
        features.add("three_or_more_components")
    if p.function_family_count >= 2:
        features.add("mixed_function_families")
    if p.technique_count >= 3:
        features.add("multiple_interacting_techniques")

    return features


# ============================================================
# GROUPING
# ============================================================

def group_questions_by_branch(
    questions: Iterable[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """
    Group the bank by broad core branch and order each branch using the existing
    progression engine.
    """
    groups: dict[str, list[dict[str, Any]]] = {}

    for question in questions:
        branch = core_branch(question)
        groups.setdefault(branch, []).append(question)

    for branch in groups:
        groups[branch] = order_questions(groups[branch])

    return groups


# ============================================================
# REPRESENTATIVE SELECTION
# ============================================================

def _important_variation(
    candidate: dict[str, Any],
    selected: list[dict[str, Any]],
) -> set[str]:
    """
    Return branch-level variation features introduced by a candidate that are
    not yet represented by selected questions from the same branch.
    """
    covered = set()

    for question in selected:
        covered.update(
            depth_features(question) & BRANCH_VARIATION_FEATURES
        )

    candidate_important = (
        depth_features(candidate)
        & BRANCH_VARIATION_FEATURES
    )

    return candidate_important - covered


def select_branch_representatives(
    branch_questions: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Choose a compact set of diagnostic representatives from one core branch.

    Policy
    ------
    1. Select the simplest question in the branch.
    2. Permit at most one additional representative by default.
    3. Add that second representative only when it introduces a materially
       different branch-level sub-skill, not merely extra complexity.
    """
    ordered = order_questions(branch_questions)

    if not ordered:
        return []

    selected = [ordered[0]]

    if MAX_REPRESENTATIVES_PER_BRANCH <= 1:
        return selected

    for question in ordered[1:]:
        new_variation = _important_variation(
            question,
            selected,
        )

        if new_variation:
            selected.append(question)

        if len(selected) >= MAX_REPRESENTATIVES_PER_BRANCH:
            break

    return selected


# ============================================================
# DIAGNOSTIC SET
# ============================================================

def build_diagnostic_set(
    questions: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Build the initial diagnostic set.

    The selector samples every detected core branch before adding depth. Each
    branch contributes its simplest representative, plus at most one additional
    question when that branch contains a materially different sub-skill.

    The final selected questions are ordered using the existing progression
    engine.
    """
    questions = list(questions)

    if not questions:
        return []

    groups = group_questions_by_branch(questions)
    selected = []

    for branch_questions in groups.values():
        selected.extend(
            select_branch_representatives(branch_questions)
        )

    return order_questions(selected)


def diagnostic_question_ids(
    questions: Iterable[dict[str, Any]],
) -> list[str]:
    """Return selected diagnostic question IDs in presentation order."""
    return [
        str(question.get("question_id", "unknown"))
        for question in build_diagnostic_set(questions)
    ]


# ============================================================
# DEVELOPER INSPECTION
# ============================================================

def analyse_diagnostic_selection(
    questions: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    """
    Explain how the bank was grouped and which representatives were selected.

    This report is intended for tuning branch definitions and checking whether
    the diagnostic granularity is appropriate.
    """
    questions = list(questions)
    groups = group_questions_by_branch(questions)
    diagnostic = build_diagnostic_set(questions)

    diagnostic_ids = {
        str(question.get("question_id", "unknown"))
        for question in diagnostic
    }

    branch_reports = []

    for branch, branch_questions in groups.items():
        selected = select_branch_representatives(
            branch_questions
        )
        selected_ids = {
            str(question.get("question_id", "unknown"))
            for question in selected
        }

        branch_reports.append({
            "branch": branch,
            "bank_question_count": len(branch_questions),
            "selected_question_count": len(selected),
            "questions": [
                {
                    "question_id": str(
                        question.get("question_id", "unknown")
                    ),
                    "selected": (
                        str(question.get("question_id", "unknown"))
                        in selected_ids
                    ),
                    "depth_features": sorted(
                        depth_features(question)
                    ),
                    "important_branch_variation": sorted(
                        depth_features(question)
                        & BRANCH_VARIATION_FEATURES
                    ),
                    "profile": asdict(
                        build_profile(question)
                    ),
                }
                for question in branch_questions
            ],
        })

    return {
        "bank_question_count": len(questions),
        "diagnostic_question_count": len(diagnostic),
        "diagnostic_question_ids": [
            str(question.get("question_id", "unknown"))
            for question in diagnostic
        ],
        "branch_count": len(groups),
        "branches": branch_reports,
    }

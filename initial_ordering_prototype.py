"""
Purpose
-------
Build a sensible default progression for a bank of maths questions when there
is not yet any learner-specific performance data.

The engine derives a structural profile for each question from information
already stored in the question bank, including:

    - generative question metadata
    - emergent mathematical metadata
    - model-solution steps
    - mark-scheme criteria
    - multipart structure
    - task wording and givens where needed

Questions are compared across several dimensions of structural complexity rather
than being reduced immediately to a single difficulty value.

The main ordering process is:

    1. Build a StructuralProfile for each question.
    2. Compare pairs of questions using structural dominance.
    3. Build a directed graph of "clearly simpler than" relationships.
    4. Topologically sort that graph.
    5. Use factual workload information to resolve cases where several
       questions are simultaneously valid next choices.

The main function intended for the practice engine is:

    order_questions(questions)

The profiling and analysis helpers are also exposed so the progression logic can
be inspected and refined as the question schema develops.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Iterable


# ============================================================
# BASIC QUESTION / SOLUTION HELPERS
# ============================================================

def _solution_parts(question: dict[str, Any]) -> list[dict[str, Any]]:
    solution = question.get("solution") or {}

    if isinstance(solution.get("parts"), list):
        return solution["parts"]

    if isinstance(solution.get("steps"), list):
        return [{
            "part": None,
            "marks_available": solution.get("total_marks", 0),
            "steps": solution["steps"],
        }]

    return []


def _solution_steps(question: dict[str, Any]) -> list[dict[str, Any]]:
    result = []

    for part in _solution_parts(question):
        for step in part.get("steps", []) or []:
            if isinstance(step, dict):
                result.append(step)

    return result


def _mark_criteria(question: dict[str, Any]) -> list[dict[str, Any]]:
    result = []

    for step in _solution_steps(question):
        for mark in step.get("marks", []) or []:
            if isinstance(mark, dict):
                result.append(mark)

    return result


def _question_text(question: dict[str, Any]) -> str:
    return str((question.get("question") or {}).get("text", ""))


def _solution_text(question: dict[str, Any]) -> str:
    chunks = []

    for step in _solution_steps(question):
        chunks.append(str(step.get("description", "")))
        chunks.append(str(step.get("working", "")))

    for criterion in _mark_criteria(question):
        chunks.append(str(criterion.get("criterion", "")))

    important_note = (question.get("solution") or {}).get("important_note")
    if important_note:
        chunks.append(str(important_note))

    return "\n".join(chunks)


def _combined_text(question: dict[str, Any]) -> str:
    return (_question_text(question) + "\n" + _solution_text(question)).lower()


def _normalised_set(values: Iterable[Any]) -> set[str]:
    return {
        str(value).strip().lower()
        for value in values
        if value is not None
    }


# ============================================================
# STRUCTURAL PROFILE
# ============================================================

@dataclass(frozen=True)
class StructuralProfile:
    """
    Derived structural description of one question.

    The profile combines question-side metadata with solution-side workload so
    questions can be compared using the same general set of dimensions.
    """

    question_id: str

    # Mathematical-object structure
    component_count: int
    function_family_count: int

    # Required mathematical machinery
    differentiation_required: int
    implicit_differentiation_required: int
    product_rule_required: int
    chain_rule_required: int
    trig_required: int
    exponential_required: int
    technique_count: int
    dy_dx_collection_required: int

    # Recognition / scaffolding
    method_recognition_required: int
    explicit_named_method: int

    # Task structure
    part_count: int
    dependent_part_count: int
    coordinate_solving_required: int
    line_construction_required: int
    domain_restriction_required: int
    multiple_case_handling_required: int
    parameter_reasoning_required: int
    exceptional_case_required: int

    # Solution / assessment structure
    total_marks: int
    solution_step_count: int
    mark_criterion_count: int
    max_marks_in_one_step: int


# ============================================================
# FEATURE EXTRACTION
# ============================================================

def build_profile(question: dict[str, Any]) -> StructuralProfile:
    generative = question.get("generative_structure") or {}
    emergent = question.get("emergent_structure") or {}
    solution = question.get("solution") or {}

    question_id = str(question.get("question_id", "unknown"))

    component_families = list(generative.get("component_families") or [])
    component_set = _normalised_set(component_families)

    techniques = list(
        emergent.get("required_techniques")
        or emergent.get("required_rules")
        or []
    )
    technique_set = _normalised_set(techniques)

    text = _combined_text(question)

    # --------------------------------------------------------
    # Components
    # --------------------------------------------------------

    component_count = len(component_families)

    # Some bank entries may not include component_families. In that case,
    # estimate the number of visible additive components from the equation.
    if component_count == 0:
        equation = str(generative.get("equation", ""))
        lhs = equation.split("=")[0] if equation else ""

        if lhs:
            # This fallback estimates visible top-level additive terms rather
            # than attempting full symbolic parsing of the equation.
            component_count = max(
                1,
                lhs.replace("-", "+-").count("+") + 1
            )

    broad_families = set()

    for family in component_set:
        if "trig" in family:
            broad_families.add("trig")
        elif "exp" in family:
            broad_families.add("exponential")
        elif "power" in family:
            broad_families.add("power")
        elif "xy" in family or "product" in family:
            broad_families.add("mixed_product")
        else:
            broad_families.add(family)

    # Infer broad function families from the equation when explicit component
    # metadata is unavailable.
    if not broad_families:
        equation = str(generative.get("equation", "")).lower()

        if any(token in equation for token in ("sin", "cos", "tan")):
            broad_families.add("trig")
        if "e^" in equation or "exp(" in equation or "^x" in equation:
            broad_families.add("exponential")
        if any(token in equation for token in ("x^", "y^")):
            broad_families.add("power")
        if "xy" in equation or "x y" in equation:
            broad_families.add("mixed_product")
        if not broad_families and equation:
            broad_families.add("other")

    function_family_count = len(broad_families)

    # --------------------------------------------------------
    # Required mathematical techniques
    #
    # Prefer structured metadata, then use the worked solution as a secondary
    # source where the bank schema is incomplete or inconsistent.
    # --------------------------------------------------------

    implicit_required = bool(
        emergent.get("requires_implicit_differentiation", False)
    ) or "differentiate implicitly" in text or "implicit differentiation" in text

    differentiation_required = int(
        implicit_required
        or "differentiate" in text
        or "dy/dx" in text
    )

    product_rule_required = int(
        "product_rule" in technique_set
        or "product rule" in text
    )

    chain_rule_required = int(
        "chain_rule" in technique_set
        or "chain rule" in text
    )

    trig_required = int(
        "trig_differentiation" in technique_set
        or "trigonometric" in text
        or any(token in text for token in ("sin(", "cos(", "tan("))
        and differentiation_required
    )

    exponential_required = int(
        "exponential_differentiation" in technique_set
        or (
            differentiation_required
            and any(token in text for token in ("e^", "ln(", "^x"))
        )
    )

    dy_dx_collection_required = int(
        bool(emergent.get("dy_dx_collection_required", False))
        or "collect the dy/dx terms" in text
        or "collect and factorise the dy/dx terms" in text
    )

    # Summarise the main interacting techniques used in the actual solution.
    actual_technique_flags = [
        int(implicit_required),
        product_rule_required,
        chain_rule_required,
        trig_required,
        exponential_required,
        dy_dx_collection_required,
    ]

    technique_count = sum(actual_technique_flags)

    # --------------------------------------------------------
    # Recognition / cueing
    # --------------------------------------------------------

    method_cue = str(generative.get("method_cue", "")).lower()

    explicit_named_method = int(method_cue == "explicit_named")

    method_recognition_required = int(
        bool(emergent.get("method_recognition_required", False))
        and not explicit_named_method
    )

    # --------------------------------------------------------
    # Parts / dependencies
    # --------------------------------------------------------

    parts = _solution_parts(question)
    part_count = max(1, len(parts))

    dependent_part_count = 0

    if part_count > 1:
        for index, part in enumerate(parts):
            if index == 0:
                continue

            part_text = " ".join(
                str(step.get("description", ""))
                + " "
                + str(step.get("working", ""))
                for step in part.get("steps", []) or []
            ).lower()

            if any(
                phrase in part_text
                for phrase in (
                    "from part (a)",
                    "from part a",
                    "use the result from part",
                    "using the result from part",
                    "previous part",
                    "previous result",
                    "hence",
                )
            ):
                dependent_part_count += 1

    # --------------------------------------------------------
    # Task demands
    # --------------------------------------------------------

    task = str(generative.get("task", "")).lower()
    givens = generative.get("givens") or {}
    given_type = str(generative.get("given_type", "")).lower()

    coordinate_solving_required = int(
        "coordinate" in task
        or "find the coordinates" in text
        or "find the value of y" in text
        or "find the value of x" in text
    )

    line_construction_required = int(
        "tangent_equation" in task
        or "normal_equation" in task
        or "equation of the tangent" in text
        or "equation of the normal" in text
    )

    domain_restriction_required = int(
        "domain" in givens
        or "domain" in given_type
        or "within the range" in text
        or "given that -" in text
        or "given that 0" in text
    )

    multiple_case_handling_required = int(
        any(
            phrase in text
            for phrase in (
                "all points",
                "two points",
                "both points",
                "or y =",
                "or x =",
                "possible x-values",
                "possible y-values",
                "no real solutions",
                "both values",
            )
        )
    )

    parameter_reasoning_required = int(
        "parameter" in task
        or "p and q are constants" in text
        or "where p and q are constants" in text
        or "find the value of p" in text
        or "find the value of q" in text
    )

    exceptional_case_required = int(
        any(
            phrase in text
            for phrase in (
                "vertical tangent",
                "horizontal tangent",
                "vertical normal",
                "horizontal normal",
                "not finite",
                "division by zero",
                "exceptional case",
            )
        )
    )

    # --------------------------------------------------------
    # Solution workload
    # --------------------------------------------------------

    steps = _solution_steps(question)
    criteria = _mark_criteria(question)

    total_marks = int(solution.get("total_marks") or 0)
    solution_step_count = len(steps)
    mark_criterion_count = len(criteria)

    marks_per_step = [
        int(step.get("marks_available") or 0)
        for step in steps
    ]

    max_marks_in_one_step = max(marks_per_step, default=0)

    return StructuralProfile(
        question_id=question_id,
        component_count=component_count,
        function_family_count=function_family_count,
        differentiation_required=differentiation_required,
        implicit_differentiation_required=int(implicit_required),
        product_rule_required=product_rule_required,
        chain_rule_required=chain_rule_required,
        trig_required=trig_required,
        exponential_required=exponential_required,
        technique_count=technique_count,
        dy_dx_collection_required=dy_dx_collection_required,
        method_recognition_required=method_recognition_required,
        explicit_named_method=explicit_named_method,
        part_count=part_count,
        dependent_part_count=dependent_part_count,
        coordinate_solving_required=coordinate_solving_required,
        line_construction_required=line_construction_required,
        domain_restriction_required=domain_restriction_required,
        multiple_case_handling_required=multiple_case_handling_required,
        parameter_reasoning_required=parameter_reasoning_required,
        exceptional_case_required=exceptional_case_required,
        total_marks=total_marks,
        solution_step_count=solution_step_count,
        mark_criterion_count=mark_criterion_count,
        max_marks_in_one_step=max_marks_in_one_step,
    )


# ============================================================
# COMPLEXITY DIMENSIONS
# ============================================================

# These fields are treated as monotonic complexity dimensions:
# larger values represent additional structural demand on that dimension.
_COMPLEXITY_FIELDS = (
    "differentiation_required",
    "implicit_differentiation_required",
    "method_recognition_required",

    "component_count",
    "function_family_count",
    "technique_count",
    "product_rule_required",
    "chain_rule_required",
    "dy_dx_collection_required",

    "part_count",
    "dependent_part_count",
    "coordinate_solving_required",
    "line_construction_required",
    "domain_restriction_required",
    "multiple_case_handling_required",
    "parameter_reasoning_required",
    "exceptional_case_required",

    "total_marks",
    "solution_step_count",
    "mark_criterion_count",
    "max_marks_in_one_step",
)


def _vector(profile: StructuralProfile) -> tuple[int, ...]:
    return tuple(
        int(getattr(profile, field))
        for field in _COMPLEXITY_FIELDS
    )


# ============================================================
# PARTIAL-ORDER COMPARISON
# ============================================================

def structurally_simpler(
    a: StructuralProfile,
    b: StructuralProfile,
) -> bool:
    """
    Return True when profile A is no more demanding than profile B on every
    measured dimension and is strictly simpler on at least one dimension.

    This relation is used to build the partial ordering between questions.
    """

    va = _vector(a)
    vb = _vector(b)

    no_more_demanding_anywhere = all(
        x <= y
        for x, y in zip(va, vb)
    )

    strictly_simpler_somewhere = any(
        x < y
        for x, y in zip(va, vb)
    )

    return no_more_demanding_anywhere and strictly_simpler_somewhere


# ============================================================
# GENERIC TIE BREAKING FOR INCOMPARABLE QUESTIONS
# ============================================================

def _tie_break_key(profile: StructuralProfile) -> tuple:
    """
    Provide a stable ordering when the dominance relation leaves several
    questions equally eligible.

    Workload and structural counts are considered from broad to fine-grained,
    with question_id used only as the final deterministic tie-break.
    """

    return (
        # First favour less solution workload
        profile.total_marks,
        profile.solution_step_count,
        profile.mark_criterion_count,

        # Then favour fewer interacting task demands
        profile.part_count,
        profile.dependent_part_count,
        profile.technique_count,
        profile.function_family_count,
        profile.component_count,

        # Then favour more scaffolding
        profile.method_recognition_required,

        # Then specialised demands
        profile.coordinate_solving_required,
        profile.line_construction_required,
        profile.domain_restriction_required,
        profile.multiple_case_handling_required,
        profile.exceptional_case_required,
        profile.parameter_reasoning_required,

        # Stable final fallback only
        profile.question_id,
    )


# ============================================================
# AUTOMATIC ORDERING
# ============================================================

def order_questions(
    questions: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Return a new list of questions in default progression order.

    Algorithm
    ---------
    1. Build a structural profile for every question.
    2. Add a directed edge A -> B when A is structurally simpler than B.
    3. Topologically sort the resulting graph.
    4. When several questions are valid next choices, use _tie_break_key()
       to keep the ordering stable and reproducible.

    The input collection is not mutated.
    """

    questions = list(questions)

    profiles = {
        index: build_profile(question)
        for index, question in enumerate(questions)
    }

    outgoing = {
        index: set()
        for index in range(len(questions))
    }

    indegree = {
        index: 0
        for index in range(len(questions))
    }

    # Build the graph of pairwise structural-dominance relationships.
    for i in range(len(questions)):
        for j in range(len(questions)):
            if i == j:
                continue

            if structurally_simpler(profiles[i], profiles[j]):
                if j not in outgoing[i]:
                    outgoing[i].add(j)
                    indegree[j] += 1

    # Kahn's algorithm produces an order that respects all graph edges.
    available = [
        index
        for index, degree in indegree.items()
        if degree == 0
    ]

    ordered_indices = []

    while available:
        available.sort(
            key=lambda index: _tie_break_key(profiles[index])
        )

        current = available.pop(0)
        ordered_indices.append(current)

        for neighbour in outgoing[current]:
            indegree[neighbour] -= 1

            if indegree[neighbour] == 0:
                available.append(neighbour)

    # Defensive fallback in case future profile changes introduce an
    # unexpected cycle or otherwise leave nodes unprocessed.
    if len(ordered_indices) != len(questions):
        remaining = [
            index
            for index in range(len(questions))
            if index not in ordered_indices
        ]

        remaining.sort(
            key=lambda index: _tie_break_key(profiles[index])
        )

        ordered_indices.extend(remaining)

    return [
        questions[index]
        for index in ordered_indices
    ]


# ============================================================
# DEVELOPER INSPECTION
# ============================================================

def analyse_question(
    question: dict[str, Any],
) -> dict[str, Any]:
    """
    Return the derived structural profile for one question as a dictionary.
    Useful when inspecting why questions are being ordered differently.
    """
    return asdict(build_profile(question))


def analyse_bank(
    questions: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Return the whole bank in progression order together with each question's
    derived profile and final progression position.
    """
    ordered = order_questions(questions)

    result = []

    for position, question in enumerate(ordered, start=1):
        profile = asdict(build_profile(question))
        profile["progression_position"] = position
        result.append(profile)

    return result


import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

import streamlit as st


# ============================================================
# PAGE
# ============================================================

st.set_page_config(
    page_title="DOJO Developer View",
    page_icon="🛠️",
    layout="wide",
)

st.title("DOJO Developer View")
st.caption("Human-readable beta session playback")


# ============================================================
# ACCESS
# ============================================================

def require_password():
    expected = str(st.secrets.get("DEV_PASSWORD", "")).strip()

    if not expected:
        st.error(
            "DEV_PASSWORD is not configured in Streamlit Secrets."
        )
        st.stop()

    if st.session_state.get("dev_authenticated"):
        return

    password = st.text_input(
        "Developer password",
        type="password",
    )

    if st.button("Open developer view", type="primary"):
        if password == expected:
            st.session_state.dev_authenticated = True
            st.rerun()
        else:
            st.error("Incorrect password.")

    st.stop()


require_password()


# ============================================================
# SUPABASE
# ============================================================

def supabase_get(path):
    try:
        supabase_url = str(st.secrets["SUPABASE_URL"]).rstrip("/")
        secret_key = str(st.secrets["SUPABASE_SECRET_KEY"])
    except Exception as exc:
        raise RuntimeError(
            f"Supabase credentials are unavailable: {exc}"
        ) from exc

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{path}",
        method="GET",
        headers={
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Accept": "application/json",
        },
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


@st.cache_data(ttl=20)
def load_completed_sessions():
    query = urllib.parse.urlencode({
        "select": (
            "session_id,learner_username,started_at,"
            "finished_at,session_data,created_at"
        ),
        "finished_at": "not.is.null",
        "order": "started_at.desc",
    })
    body = supabase_get(f"dojo_sessions?{query}")
    return json.loads(body or "[]")


@st.cache_data(ttl=20)
def load_active_sessions():
    query = urllib.parse.urlencode({
        "select": (
            "session_id,learner_username,started_at,"
            "finished_at,session_data,created_at"
        ),
        "finished_at": "is.null",
        "order": "started_at.desc",
    })
    body = supabase_get(f"dojo_sessions?{query}")
    return json.loads(body or "[]")


# ============================================================
# HELPERS
# ============================================================

def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def format_datetime(value):
    dt = parse_iso(value)
    if dt is None:
        return str(value or "Unknown")
    return dt.strftime("%d %b %Y, %H:%M:%S")


def format_duration(seconds):
    try:
        seconds = float(seconds)
    except Exception:
        return "Unknown"

    if seconds < 60:
        return f"{seconds:.0f}s"

    minutes = int(seconds // 60)
    remaining = int(round(seconds % 60))

    if minutes < 60:
        return f"{minutes}m {remaining}s"

    hours = minutes // 60
    minutes = minutes % 60
    return f"{hours}h {minutes}m"


def question_label(summary):
    question_id = str(summary.get("question_id", "unknown"))
    number = summary.get("question_number")
    if number is None:
        return question_id
    return f"{question_id} · Question {number}"


def safe_bool(value):
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    return "Not recorded"


def event_type(event):
    return str(event.get("event_type") or event.get("type") or "")


def session_events(payload):
    events = payload.get("events", [])
    return events if isinstance(events, list) else []


def attempt_summaries(payload):
    summaries = payload.get("attempt_summaries", [])
    return summaries if isinstance(summaries, list) else []


def find_session_ended(payload):
    for event in reversed(session_events(payload)):
        if event_type(event) == "session_ended":
            return event
    return {}


def find_question_selection_events(payload):
    results = []
    for event in session_events(payload):
        etype = event_type(event)
        if "selected" in etype or "selection" in etype:
            results.append(event)
    return results


def events_for_question(payload, question_id):
    results = []
    for event in session_events(payload):
        if str(event.get("question_id", "")) == str(question_id):
            results.append(event)
    return results


def describe_attempt(summary):
    pieces = []

    duration = (
        summary.get("duration_seconds")
        or summary.get("question_duration_seconds")
    )
    if duration is not None:
        pieces.append(f"spent {format_duration(duration)}")

    checks = (
        summary.get("check_count")
        or summary.get("checks")
        or summary.get("total_checks")
    )
    if checks is not None:
        try:
            checks_n = int(checks)
            pieces.append(
                f"checked {checks_n} time"
                + ("" if checks_n == 1 else "s")
            )
        except Exception:
            pass

    first_correct = summary.get("first_check_correct")
    if first_correct is True:
        pieces.append("first check was reported correct")
    elif first_correct is False:
        pieces.append("first check was reported incorrect")

    help_count = (
        summary.get("help_count")
        or summary.get("markscheme_steps_revealed")
        or summary.get("revealed_step_count")
    )
    if help_count:
        pieces.append(f"used {help_count} help/reveal action(s)")

    solution_seen = (
        summary.get("solution_seen")
        or summary.get("full_solution_seen")
    )
    if solution_seen:
        pieces.append("opened the full solution")

    eventual = summary.get("eventual_checked_correct")
    if eventual is True and first_correct is not True:
        pieces.append("later reported the answer correct")

    outcome = summary.get("outcome")
    if outcome:
        pieces.append(f"ended as `{outcome}`")

    if not pieces:
        return "DOJO recorded an attempt, but the summary contains little behavioural detail."

    return "Student " + ", ".join(pieces) + "."


def phase_from_summary(summary, payload):
    explicit = (
        summary.get("phase")
        or summary.get("phase_label")
        or summary.get("selection_phase")
    )
    if explicit:
        return str(explicit)

    qid = str(summary.get("question_id", ""))
    for event in events_for_question(payload, qid):
        phase = (
            event.get("phase")
            or event.get("phase_label")
            or event.get("selection_phase")
        )
        if phase:
            return str(phase)

    return "Unknown phase"


def selection_for_question(payload, question_id):
    for event in session_events(payload):
        if str(event.get("question_id", "")) != str(question_id):
            continue
        etype = event_type(event)
        if "selection" in etype or "selected" in etype:
            return event
    return None


def human_selection_text(selection):
    if not selection:
        return None

    method = (
        selection.get("selection_method")
        or selection.get("method")
        or selection.get("phase")
    )

    rank = (
        selection.get("selected_rank")
        or selection.get("rank")
    )

    candidate_count = (
        selection.get("candidate_count")
        or selection.get("available_candidate_count")
    )

    bits = []
    if method:
        bits.append(f"selection method: `{method}`")
    if rank is not None:
        bits.append(f"selected rank: {rank}")
    if candidate_count is not None:
        bits.append(f"{candidate_count} candidates recorded")

    if bits:
        return "; ".join(bits) + "."
    return "A selection event was recorded."


def session_story(payload):
    summaries = attempt_summaries(payload)
    if not summaries:
        return ["No completed question attempts were recorded in this session."]

    lines = []
    for index, summary in enumerate(summaries, start=1):
        qid = str(summary.get("question_id", "unknown"))
        phase = phase_from_summary(summary, payload)
        lines.append(
            {
                "number": index,
                "question_id": qid,
                "phase": phase,
                "summary": summary,
                "description": describe_attempt(summary),
                "selection": selection_for_question(payload, qid),
            }
        )
    return lines


# ============================================================
# LOAD DATA
# ============================================================

if st.button("Refresh data"):
    st.cache_data.clear()
    st.rerun()

try:
    completed_rows = load_completed_sessions()
    active_rows = load_active_sessions()
except Exception as exc:
    st.error(f"Could not load DOJO session data: {exc}")
    st.stop()

all_rows = completed_rows + active_rows

if not all_rows:
    st.info("No DOJO sessions have been saved yet.")
    st.stop()

usernames = sorted({
    str(row.get("learner_username"))
    for row in all_rows
    if row.get("learner_username")
})

if not usernames:
    st.warning(
        "Sessions exist, but none have a learner_username yet."
    )
    st.stop()


# ============================================================
# SESSION PICKER
# ============================================================

left, middle, right = st.columns([1.4, 1.7, 1])

with left:
    selected_username = st.selectbox(
        "Learner",
        usernames,
    )

user_rows = [
    row for row in all_rows
    if str(row.get("learner_username")) == selected_username
]

user_rows.sort(
    key=lambda row: str(row.get("started_at") or ""),
    reverse=True,
)


def row_label(row):
    status = "Completed" if row.get("finished_at") else "In progress"
    return (
        f"{format_datetime(row.get('started_at'))} · "
        f"{status} · {row.get('session_id')}"
    )


with middle:
    labels = [row_label(row) for row in user_rows]
    selected_label = st.selectbox(
        "Session",
        labels,
    )
    selected_row = user_rows[labels.index(selected_label)]

payload = selected_row.get("session_data") or {}

with right:
    st.metric(
        "Saved sessions",
        len(user_rows),
    )


# ============================================================
# SESSION OVERVIEW
# ============================================================

st.divider()
st.subheader("Session overview")

ended = find_session_ended(payload)
summaries = attempt_summaries(payload)

duration = ended.get("duration_seconds")
if duration is None:
    start_dt = parse_iso(selected_row.get("started_at"))
    end_dt = parse_iso(selected_row.get("finished_at"))
    if start_dt and end_dt:
        duration = (end_dt - start_dt).total_seconds()

overview_cols = st.columns(4)
overview_cols[0].metric(
    "Questions attempted",
    len(summaries),
)
overview_cols[1].metric(
    "Duration",
    format_duration(duration) if duration is not None else "In progress",
)
overview_cols[2].metric(
    "Outcome",
    payload.get("session_outcome")
    or ended.get("outcome")
    or ("In progress" if not selected_row.get("finished_at") else "Unknown"),
)
overview_cols[3].metric(
    "Session ID",
    str(selected_row.get("session_id", "unknown")),
)

st.write(
    f"**Learner:** `{selected_username}`  \n"
    f"**Started:** {format_datetime(selected_row.get('started_at'))}  \n"
    f"**Finished:** {format_datetime(selected_row.get('finished_at')) if selected_row.get('finished_at') else 'Still in progress'}"
)


# ============================================================
# HUMAN SESSION STORY
# ============================================================

st.divider()
st.subheader("What the session looked like")

story = session_story(payload)

if story and isinstance(story[0], str):
    st.info(story[0])
else:
    for item in story:
        summary = item["summary"]
        qid = item["question_id"]
        phase = item["phase"]

        st.markdown(
            f"### {item['number']}. {qid} — {phase}"
        )
        st.write(item["description"])

        selection_text = human_selection_text(item["selection"])
        if selection_text:
            st.caption(f"Why this question appeared: {selection_text}")

        with st.expander("Question-level evidence"):
            st.write("**Attempt summary**")
            st.json(summary)

            selection = item["selection"]
            if selection:
                st.write("**Selection event**")
                st.json(selection)

            q_events = events_for_question(payload, qid)
            if q_events:
                st.write("**Events tied to this question**")
                st.json(q_events)

        st.divider()


# ============================================================
# DIAGNOSTIC / SELECTION DEBUGGING
# ============================================================

st.subheader("Session mechanics")

start_event = {}
for event in session_events(payload):
    if event_type(event) == "session_started":
        start_event = event
        break

if start_event:
    mechanics_cols = st.columns(4)
    mechanics_cols[0].metric(
        "Diagnostic total",
        start_event.get("diagnostic_question_count", "—"),
    )
    mechanics_cols[1].metric(
        "Already completed",
        start_event.get(
            "diagnostic_questions_already_completed", "—"
        ),
    )
    mechanics_cols[2].metric(
        "Remaining at start",
        start_event.get("diagnostic_questions_remaining", "—"),
    )
    mechanics_cols[3].metric(
        "Historical attempts loaded",
        start_event.get("historical_attempt_summary_count", "—"),
    )

    if start_event.get("diagnostic_question_order"):
        st.write("**Diagnostic order for this session**")
        st.code(
            " → ".join(
                str(qid)
                for qid in start_event["diagnostic_question_order"]
            )
        )

selection_events = find_question_selection_events(payload)
with st.expander("All recorded selection events"):
    if selection_events:
        st.json(selection_events)
    else:
        st.write("No selection events were found in this saved session.")


# ============================================================
# RAW DEBUGGING
# ============================================================

st.divider()
st.subheader("Technical details")

with st.expander("Raw session events"):
    st.json(session_events(payload))

with st.expander("Raw attempt summaries"):
    st.json(summaries)

with st.expander("Entire stored session JSON"):
    st.json(payload)

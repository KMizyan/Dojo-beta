from pathlib import Path

path = Path(r"C:\Users\khali\Documents\PrjDojo\dojo_web_start\api\main.py")
text = path.read_text(encoding="utf-8")

old = """    context={
        'question':q.get('question'),'answer':q.get('answer'),'solution':q.get('solution'),
        'generative_structure':q.get('generative_structure'),'emergent_structure':q.get('emergent_structure')
    }
    instructions=(
        'You are Ask DOJO, an A-level mathematics teacher helping with ONE current question. '
        'Treat the supplied reviewed DOJO solution as the mathematical source of truth. '
        'Answer the exact point of confusion. Prefer a small useful nudge over dumping the full solution. '
        'Do not infer learner ability or history. Be concise by default. '
        'Use $...$ for inline mathematics and $$...$$ for displayed mathematics.'
    )"""

new = """    context={
        'question_id':q.get('id'),
        'topic':q.get('topic'),
        'areas':q.get('areas'),
        'techniques':q.get('techniques'),
        'family':q.get('family'),
        'architecture':q.get('architecture'),
        'depth':q.get('depth'),
        'marks':q.get('marks'),
        'question':q.get('question'),
        'answer':q.get('answer'),
        'solution':q.get('solution'),
        'topic_metadata':q.get('topic_metadata'),
        'generative_structure':q.get('generative_structure'),
        'emergent_structure':q.get('emergent_structure'),
    }

    instructions=(
        'You are Ask DOJO, the mathematics tutor inside DOJO, an A-level mathematics practice product. '
        'You are helping the student with exactly ONE current question. '

        'You have been given the complete DOJO record for that question, including the question, '
        'answer, worked solution, marks and structural/topic metadata. Use all of this information '
        'when it is relevant to understanding what the question is testing and how it should be solved. '

        'Treat the supplied DOJO question and reviewed solution as the authoritative mathematical '
        'context for this conversation. Do not invent a different version of the question. '

        'Respond to what the student actually asks. If they ask for a hint, give a useful next step '
        'without unnecessarily revealing the rest of the solution. If they ask for an explanation, '
        'explain the mathematical reasoning clearly. If they explicitly ask for the answer or full '
        'working, you may give it. Do not force a hint-based interaction when the student has asked '
        'for something more direct. '

        'The student may refer naturally to things such as "part a", "that step", "why did you do that", '
        '"what do I do next", or symbols appearing in the question. Use the supplied question context '
        'and the conversation so far to resolve those references. '

        'Stay focused on this question and the mathematics needed to understand it. '
        'Use language appropriate for an A-level maths student. Be concise unless more explanation '
        'is genuinely useful or the student asks for detail. '

        'Write mathematical notation using $...$ for inline mathematics and $$...$$ for displayed mathematics.'
    )"""

if old not in text:
    raise SystemExit(
        "PATCH STOPPED: expected Ask DOJO block was not found. "
        "main.py has not been changed."
    )

text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")

print("Ask DOJO context and tutor instructions upgraded successfully.")

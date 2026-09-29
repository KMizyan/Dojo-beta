import sys
sys.path.insert(0, r'.\api')
import main

for q in main.catalogue():
    question = q.get('question') or {}
    text = question.get('text', '') if isinstance(question, dict) else str(question)

    print()
    print(f"[{q['topic']}] {q.get('family')} | {q.get('architecture')}")
    print("TECH:", ", ".join(q.get('techniques') or []))
    print("Q:", text[:220])

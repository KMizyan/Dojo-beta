# DOJO web application

This is the start of the actual DOJO web codebase. The frontend is Next.js; the API is FastAPI and reads the existing `PrjDojo/topics/*/data/rendered_question_bank*.json` banks directly.

## 1. Start the Python API
From this folder:

Windows PowerShell:

    $env:DOJO_PROJECT_ROOT="C:\Users\khal1\Documents\PrjDojo"
    python -m uvicorn api.main:app --reload --port 8000

If `PrjDojo` is under OneDrive, use that actual path instead.

## 2. Start the website
Open a second terminal:

    cd web
    npm install
    npm run dev

Then open `http://localhost:3000`.

The website and Python layer are deliberately separate: the student-facing UI can now be redesigned freely while the existing maths engines/banks stay Python.

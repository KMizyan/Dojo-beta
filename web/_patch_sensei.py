from pathlib import Path
import shutil
import subprocess
import sys
import time

root = Path(r"C:\Users\khali\Documents\PrjDojo\dojo_web_start\web")
backup_root = Path(r"C:\Users\khali\Documents\PrjDojo\_chat_work\backups") / f"sensei-redesign-{int(time.time())}"

tsx = root / "components" / "PracticeSession.tsx"
css = root / "app" / "globals.css"

files = [tsx, css]

backup_root.mkdir(parents=True, exist_ok=True)

for path in files:
    rel = path.relative_to(root)
    dest = backup_root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)

def restore():
    for path in files:
        rel = path.relative_to(root)
        shutil.copy2(backup_root / rel, path)
    print("Patch failed — restored original files.")

try:
    source = tsx.read_text(encoding="utf-8")

    replacements = {
        "Ask DOJO could not identify this question.":
            "SENSEI could not identify this question.",

        "You've used Ask DOJO on ${entitlement.allowance} unique questions during your trial. You can still continue Ask DOJO conversations on questions you've already used it on.":
            "You've used SENSEI on ${entitlement.allowance} unique questions during your trial. You can still continue SENSEI conversations on questions you've already used it on.",

        "Ask DOJO could not respond.":
            "SENSEI could not respond.",

        "Ask DOJO returned an empty response.":
            "SENSEI returned an empty response.",

        "Could not release Ask DOJO trial use:":
            "Could not release SENSEI trial use:",

        'placeholder="Ask DOJO about this question…"':
            'placeholder="Ask SENSEI about this question…"',    

        "<b>Ask DOJO</b>":
            "<b>SENSEI</b>",

        "Ask DOJO for hints, explanations and help with individual steps.":
            "Ask SENSEI for hints, explanations and help with individual steps."
    }

    for old, new in replacements.items():
        source = source.replace(old, new)

    tsx.write_text(source, encoding="utf-8")

    css_source = css.read_text(encoding="utf-8")

    marker = "/* DOJO SENSEI PRACTICE WORKSPACE */"

    if marker in css_source:
        css_source = css_source.split(marker)[0].rstrip() + "\n"

    css_source += r'''

/* DOJO SENSEI PRACTICE WORKSPACE */

body .practiceSession .questionWorkspace {
  grid-template-columns: minmax(0, 1.42fr) minmax(400px, .88fr);
  gap: 28px;
  align-items: start;
}

body .practiceSession .dojoColumn {
  position: sticky;
  top: 22px;
  height: min(720px, calc(100vh - 44px));
  min-height: 560px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #252a27;
  border-radius: 14px;
  background: #0d110f;
  color: #f5f4ef;
  box-shadow: none;
}

body .practiceSession .dojoColumnHeading {
  height: 68px;
  flex: 0 0 68px;
  padding: 0 22px;
  border-bottom: 1px solid #292e2b;
  background: #0d110f;
}

body .practiceSession .dojoColumnHeading b {
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: .08em;
}

body .practiceSession .dojoColumnHeading span {
  color: #8f9791;
  font-size: 11px;
}

body .practiceSession .dojoColumn .dojoChat {
  position: static;
  width: 100%;
  height: auto;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  filter: none;
}

body .practiceSession .dojoColumn .dojoChatBody {
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: #0d110f;
}

body .practiceSession .dojoColumn .dojoMessages {
  height: auto;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px 22px 32px;
  background: #0d110f;
  scrollbar-color: #424944 transparent;
  scrollbar-width: thin;
}

body .practiceSession .dojoColumn .dojoMessages > p {
  max-width: 310px;
  margin: 4px 0;
  color: #8f9791;
  font-size: 13px;
  line-height: 1.65;
}

body .practiceSession .dojoColumn .dojoMessage {
  max-width: 92%;
  margin: 12px 0;
  padding: 13px 15px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
}

body .practiceSession .dojoColumn .dojoMessage.user {
  margin-left: auto;
  border: 1px solid #315cf5;
  background: #315cf5;
  color: #fff;
}

body .practiceSession .dojoColumn .dojoMessage.assistant {
  border: 1px solid #303632;
  background: #171c19;
  color: #f2f2ed;
}

body .practiceSession .dojoColumn .dojoMessage.assistant .katex {
  color: #f2f2ed;
}

body .practiceSession .dojoColumn .dojoChatError {
  margin: 12px 0;
  padding: 12px 14px;
  border: 1px solid #643a3a;
  border-radius: 8px;
  background: #241616;
  color: #ffb9b9;
}

body .practiceSession .dojoColumn .dojoChatError a {
  color: #fff;
}

body .practiceSession .dojoColumn .dojoChatBody form {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  gap: 9px;
  padding: 16px;
  border-top: 1px solid #292e2b;
  background: #111613;
}

body .practiceSession .dojoColumn .dojoChatBody input {
  min-width: 0;
  height: 48px;
  flex: 1;
  padding: 0 15px;
  border: 1px solid #3a403c;
  border-radius: 9px;
  outline: none;
  background: #1a201c;
  color: #fff;
  font: inherit;
  font-size: 13px;
}

body .practiceSession .dojoColumn .dojoChatBody input::placeholder {
  color: #858c87;
}

body .practiceSession .dojoColumn .dojoChatBody input:focus {
  border-color: #315cf5;
}

body .practiceSession .dojoColumn .dojoChatBody form button {
  min-width: 72px;
  height: 48px;
  padding: 0 18px;
  border: 0;
  border-radius: 9px;
  background: #315cf5;
  color: #fff;
  font-weight: 800;
  cursor: pointer;
}

body .practiceSession .dojoColumn .dojoChatBody form button:disabled {
  background: #303632;
  color: #777f79;
  opacity: 1;
  cursor: default;
}

@media (max-width: 1050px) {
  body .practiceSession .questionWorkspace {
    grid-template-columns: minmax(0, 1.3fr) minmax(340px, .8fr);
    gap: 20px;
  }
}

@media (max-width: 950px) {
  body .practiceSession .questionWorkspace {
    grid-template-columns: 1fr;
  }

  body .practiceSession .dojoColumn {
    position: static;
    width: 100%;
    height: 620px;
    min-height: 520px;
  }
}

@media (max-width: 600px) {
  body .practiceSession .dojoColumn {
    height: 560px;
    min-height: 480px;
    border-radius: 10px;
  }

  body .practiceSession .dojoColumnHeading {
    height: 58px;
    flex-basis: 58px;
    padding: 0 16px;
  }

  body .practiceSession .dojoColumn .dojoMessages {
    padding: 18px 16px 24px;
  }
}

/* END DOJO SENSEI PRACTICE WORKSPACE */
'''

    css.write_text(css_source, encoding="utf-8")

    print("Patched PracticeSession.tsx and globals.css")
    print("Running TypeScript check...")

    result = subprocess.run(
        ["npx.cmd", "tsc", "--noEmit"],
        cwd=root,
        text=True
    )

    if result.returncode != 0:
        raise RuntimeError("TypeScript check failed")

    print("Running production build...")

    result = subprocess.run(
        ["npm.cmd", "run", "build"],
        cwd=root,
        text=True
    )

    if result.returncode != 0:
        raise RuntimeError("Production build failed")

    print("")
    print("SUCCESS")
    print("SENSEI redesign applied.")
    print(f"Backup: {backup_root}")

except Exception as exc:
    print(f"ERROR: {exc}")
    restore()
    sys.exit(1)

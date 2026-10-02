from pathlib import Path
import shutil
import subprocess
import sys
import time

root = Path(r"C:\Users\khali\Documents\PrjDojo\dojo_web_start\web")
css = root / "app" / "globals.css"
backup = Path(r"C:\Users\khali\Documents\PrjDojo\_chat_work\backups") / f"sensei-width-{int(time.time())}" / "globals.css"

backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(css, backup)

try:
    s = css.read_text(encoding="utf-8")

    marker = "/* DOJO SENSEI WIDTH + CHAT BLUE */"

    if marker in s:
        s = s.split(marker)[0].rstrip() + "\n"

    s += r'''

/* DOJO SENSEI WIDTH + CHAT BLUE */

/*
  Give the practice workspace more room overall, then divide it
  much more generously between the paper and SENSEI.
*/
body .practiceSession {
  width: min(1500px, calc(100vw - 56px)) !important;
  max-width: 1500px !important;
}

body .practiceSession .questionWorkspace {
  grid-template-columns: minmax(620px, 1.25fr) minmax(540px, 1fr) !important;
  gap: 30px !important;
}

/* ChatGPT-like dark blue for student messages */
body .practiceSession .dojoColumn .dojoMessage.user {
  background: #1f4f8f !important;
  border-color: #1f4f8f !important;
  color: #fff !important;
}

/*
  Let messages use more of the new width.
  Assistant maths should only need horizontal scrolling for
  genuinely wide expressions.
*/
body .practiceSession .dojoColumn .dojoMessage {
  max-width: 96% !important;
}

body .practiceSession .dojoColumn .dojoMessage.assistant {
  width: fit-content;
  max-width: 96% !important;
}

body .practiceSession .dojoColumn .katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  max-width: 100%;
  padding-bottom: 4px;
}

@media (max-width: 1250px) {
  body .practiceSession .questionWorkspace {
    grid-template-columns: minmax(520px, 1.15fr) minmax(450px, 1fr) !important;
    gap: 22px !important;
  }
}

@media (max-width: 1000px) {
  body .practiceSession {
    width: min(900px, calc(100vw - 40px)) !important;
  }

  body .practiceSession .questionWorkspace {
    grid-template-columns: 1fr !important;
  }
}

/* END DOJO SENSEI WIDTH + CHAT BLUE */
'''

    css.write_text(s, encoding="utf-8")

    print("Running TypeScript check...")
    r = subprocess.run(["npx.cmd", "tsc", "--noEmit"], cwd=root)
    if r.returncode != 0:
        raise RuntimeError("TypeScript check failed")

    print("Running production build...")
    r = subprocess.run(["npm.cmd", "run", "build"], cwd=root)
    if r.returncode != 0:
        raise RuntimeError("Production build failed")

    print("")
    print("SUCCESS")
    print("SENSEI widened and chat blue updated.")
    print(f"Backup: {backup}")

except Exception as e:
    shutil.copy2(backup, css)
    print(f"ERROR: {e}")
    print("Original globals.css restored.")
    sys.exit(1)

from pathlib import Path
import shutil
import subprocess
import sys
import time

root = Path(r"C:\Users\khali\Documents\PrjDojo\dojo_web_start\web")
css = root / "app" / "globals.css"

backup_root = Path(r"C:\Users\khali\Documents\PrjDojo\_chat_work\backups")
backup = backup_root / ("alevel-nav-" + time.strftime("%Y%m%d-%H%M%S"))
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(css, backup / "globals.css")

try:
    text = css.read_text(encoding="utf-8")

    text += """

/* A-LEVEL MATHEMATICS NAV LABEL — FINAL POSITION */
body .nav .brandSubject {
  margin-left: 42px !important;
  padding-left: 32px !important;
  color: rgba(255, 255, 255, 0.82) !important;
  font-size: 12px !important;
  font-weight: 650 !important;
  letter-spacing: 0.10em !important;
  opacity: 1 !important;
}

body .nav .brandSubject::before {
  left: 0 !important;
  background: rgba(255, 255, 255, 0.25) !important;
}
/* END A-LEVEL MATHEMATICS NAV LABEL */
"""

    css.write_text(text, encoding="utf-8")

    subprocess.run(["npx.cmd", "tsc", "--noEmit"], cwd=root, check=True)
    subprocess.run(["npm.cmd", "run", "build"], cwd=root, check=True)

    print("")
    print("A-LEVEL MATHEMATICS NAV PATCH PASSED")
    print("- brighter")
    print("- larger")
    print("- further from PROJECT DOJO")
    print("Backup:", backup)

except Exception as e:
    shutil.copy2(backup / "globals.css", css)
    print("")
    print("PATCH FAILED — globals.css restored automatically.")
    print(e)
    sys.exit(1)

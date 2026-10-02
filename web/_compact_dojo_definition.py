from pathlib import Path
import shutil
import subprocess
import sys
import time

root = Path(r"C:\Users\khali\Documents\PrjDojo\dojo_web_start\web")
css = root / "app" / "globals.css"

backup_root = Path(r"C:\Users\khali\Documents\PrjDojo\_chat_work\backups")
backup = backup_root / ("compact-dojo-definition-" + time.strftime("%Y%m%d-%H%M%S"))
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(css, backup / "globals.css")

try:
    text = css.read_text(encoding="utf-8")

    text += """

/* DOJO DEFINITION — COMPACT BRAND MESSAGE */
body .dojoHome .dojoDefinition h1 {
  font-size: 42px !important;
  line-height: 1 !important;
  letter-spacing: -0.05em !important;
}

body .dojoHome .dojoDefinitionHeading {
  gap: 11px !important;
}

body .dojoHome .dojoDefinition > p {
  margin-top: 12px !important;
  font-size: 18px !important;
  line-height: 1.45 !important;
}
/* END DOJO DEFINITION — COMPACT BRAND MESSAGE */
"""

    css.write_text(text, encoding="utf-8")

    subprocess.run(["npx.cmd", "tsc", "--noEmit"], cwd=root, check=True)
    subprocess.run(["npm.cmd", "run", "build"], cwd=root, check=True)

    print("")
    print("COMPACT DOJO DEFINITION PATCH PASSED")
    print("- DOJO reduced to 42px")
    print("- Definition block tightened")
    print("Backup:", backup)

except Exception as e:
    shutil.copy2(backup / "globals.css", css)
    print("")
    print("PATCH FAILED — globals.css restored automatically.")
    print(e)
    sys.exit(1)

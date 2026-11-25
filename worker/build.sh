#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Use an allowlist; the Worker source and credentials never become public assets.
python3 - <<'PY'
from pathlib import Path
import re
import shutil
root = Path.cwd().parent
out = Path.cwd() / 'public'
# Only generated assets live here. Rebuilding removes assets deleted at source.
if out.exists():
    shutil.rmtree(out)
out.mkdir()
allowed = {'.html', '.js', '.css', '.webmanifest', '.png', '.svg', '.ico', '.txt'}
for path in root.iterdir():
    if path.is_file() and path.suffix in allowed:
        shutil.copy2(path, out / path.name)
# Discover local asset directories from markup/CSS/JS, in addition to img/.
dirs = {'img'}
for path in root.iterdir():
    if path.is_file() and path.suffix in {'.html', '.css', '.js', '.webmanifest'}:
        for match in re.finditer(r'''["'(=]\s*(?:\./)?([A-Za-z0-9_-]+)/[^\s"'<>)]*''', path.read_text()):
            dirs.add(match[1])
for name in dirs:
    source = root / name
    if name != 'worker' and not name.startswith('.') and source.is_dir():
        shutil.copytree(source, out / name, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.*'))
print('Built worker/public')
PY

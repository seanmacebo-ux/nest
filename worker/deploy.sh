#!/bin/sh
set -eu
cd "$(dirname "$0")"
./build.sh
# Pass credentials in the subprocess environment, never shell output or argv.
exec python3 - <<'PY'
import json
import os
from pathlib import Path
creds = json.loads(Path('/Users/seanmacebo/Workspace/data-pipelines/credentials/cloudflare_nest.json').read_text())
env = {**os.environ, 'CLOUDFLARE_API_TOKEN': creds['api_token'], 'CLOUDFLARE_ACCOUNT_ID': creds['account_id']}
os.execvpe('npx', ['npx', '--yes', 'wrangler', 'deploy'], env)
PY

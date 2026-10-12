#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip install -e . --no-deps
npm ci --prefix frontend
node frontend/scripts/copy-monaco.mjs
printf '%s\n' 'Ready. Run: .venv/bin/python scripts/run.py'

#!/usr/bin/env bash
# Vectorography: one command. Backend owns the space, frontend owns the journey.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "· creating python environment"
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r backend/requirements.txt
fi

if [ ! -d backend/data/fonts ] || [ -z "$(ls -A backend/data/fonts 2>/dev/null)" ]; then
  echo "· fetching the OFL corpus (first run only, a few minutes)"
  .venv/bin/python backend/corpus/fetch.py "${VG_CORPUS_SIZE:-500}"
fi

if [ ! -d frontend/node_modules ]; then
  echo "· installing frontend dependencies"
  (cd frontend && npm install --silent)
fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "· starting the space on :8765"
(cd backend && ../.venv/bin/python -m uvicorn main:app --port 8765 --host 127.0.0.1) &

echo "· starting the navigator on :5173"
(cd frontend && npm run dev -- --port 5173) &

wait

"""Vercel entry point: one serverless function carrying the whole space.

The backend package expects to be imported from inside `backend/`, as it is by
uvicorn in run.sh, so that directory goes on the path before the app is
imported. vercel.json rewrites /api/* here and the function receives the path
the browser asked for, so the routes declared in main.py need no change between
the local server and the deployment.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from main import app  # noqa: E402,F401

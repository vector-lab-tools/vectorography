"""Vercel entry point: one serverless function carrying the whole space.

The backend package expects to be imported from inside `backend/`, as it is by
uvicorn in run.sh, so that directory goes on the path before the app is
imported. Everything under /api/* is rewritten here by vercel.json, and FastAPI
sees the original path, so the routes need no change between local and hosted.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from main import app  # noqa: E402,F401

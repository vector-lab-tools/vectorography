"""Vercel entry point: one serverless function carrying the whole space.

The backend package expects to be imported from inside `backend/`, as it is by
uvicorn in run.sh, so that directory goes on the path before the app is
imported.

Vercel routes a request by the *rewritten* destination path, so the function is
reached at /api/index/... rather than at the path the browser asked for.
vercel.json therefore rewrites /api/corpus to /api/index/api/corpus, and the
mount below strips the /api/index prefix, leaving the app the /api/corpus its
routes are declared with. Local uvicorn is untouched by any of this.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi import FastAPI  # noqa: E402

from main import app as navigator  # noqa: E402

app = FastAPI(title="Vectorography (Vercel)")
app.mount("/api/index", navigator)

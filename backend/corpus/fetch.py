"""
Corpus fetch: OFL-licensed Google Fonts only.

Provenance is a design decision, not a convenience. This module will only ever
read from the ``ofl/`` directory of google/fonts, which is the SIL Open Font
Licence tree. No other source is permitted.
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

TREE_URL = "https://api.github.com/repos/google/fonts/git/trees/main?recursive=1"
RAW = "https://raw.githubusercontent.com/google/fonts/main/"

DATA = Path(__file__).resolve().parents[1] / "data"
FONT_DIR = DATA / "fonts"
TREE_CACHE = DATA / "ofl-tree.json"
MANIFEST = DATA / "corpus-manifest.json"

# Static Regular weights only. Variable fonts in the corpus are skipped: a
# variable master is already a designspace and would enter the latent space as
# a single arbitrary instance.
SKIP = ("[", "]")


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "vectorography/0.1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def list_ofl_regulars() -> list[tuple[str, str]]:
    """Return (family, path) for every OFL static Regular TTF in google/fonts."""
    if TREE_CACHE.exists():
        tree = json.loads(TREE_CACHE.read_text())
    else:
        DATA.mkdir(parents=True, exist_ok=True)
        tree = json.loads(_get(TREE_URL))
        TREE_CACHE.write_text(json.dumps(tree))

    out: dict[str, str] = {}
    for node in tree.get("tree", []):
        p = node.get("path", "")
        if not p.startswith("ofl/") or not p.endswith("-Regular.ttf"):
            continue
        if any(s in p for s in SKIP):
            continue
        parts = p.split("/")
        if len(parts) != 3:
            continue
        family = parts[1]
        out.setdefault(family, p)
    return sorted(out.items())


def download(limit: int = 500, force: bool = False) -> list[dict]:
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    families = list_ofl_regulars()[:limit]
    manifest = []
    for i, (family, path) in enumerate(families):
        dest = FONT_DIR / f"{family}.ttf"
        if force or not dest.exists():
            try:
                dest.write_bytes(_get(RAW + urllib.parse.quote(path)))
            except Exception as exc:  # noqa: BLE001
                print(f"  skip {family}: {exc}")
                continue
            time.sleep(0.02)
        manifest.append({"family": family, "source": path, "licence": "OFL-1.1"})
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(families)}")
    MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(f"corpus: {len(manifest)} OFL families in {FONT_DIR}")
    return manifest


if __name__ == "__main__":
    import sys
    import urllib.parse  # noqa: F401

    download(limit=int(sys.argv[1]) if len(sys.argv) > 1 else 500)

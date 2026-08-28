#!/usr/bin/env python3
"""Stamp the version from ./VERSION into the files that cannot read it at run time.

VERSION is the single source. The backend reads it directly at import, and the
frontend reads it at build time through vite.config.ts. Only CITATION.cff needs
a literal, because citation metadata has to stand alone, so it is written here.
Run after changing VERSION. Versions move in steps of 0.01, and only when agreed.
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parents[1]
version = (root / "VERSION").read_text().strip()

# The README states the version in prose, where nothing can read it back, so
# it is stamped here with the rest.
readme = root / "README.md"
text = readme.read_text()
new = re.sub(r'^\*\*Version:\*\* .*$', f"**Version:** {version}, August 2026",
             text, flags=re.M)
if new != text:
    readme.write_text(new)
    print(f"README.md -> {version}")

# MODEL.md states the model's own version, which moves independently of the
# application's; the app version it was built for is stamped from here.
model_doc = root / "MODEL.md"
if model_doc.exists():
    text = model_doc.read_text()
    new = re.sub(r'^\*\*For Vectorography [\d.]+\*\*',
                 f"**For Vectorography {version}**", text, flags=re.M)
    if new != text:
        model_doc.write_text(new)
        print(f"MODEL.md -> for {version}")

cff = root / "CITATION.cff"
text = cff.read_text()
new = re.sub(r'^version: .*$', f'version: "{version}"', text, flags=re.M)
if new != text:
    cff.write_text(new)
    print(f"CITATION.cff -> {version}")
else:
    print(f"CITATION.cff already at {version}")
sys.exit(0)

#!/usr/bin/env bash
# Publish to a Hugging Face Space.
#
#   tools/push-space.sh <owner>/<space-name>
#
# Uses the Hugging Face CLI, which creates the Space if it is missing and
# handles large files itself; the fitted space is about thirty megabytes and
# an ordinary git push would be refused. Log in first with:
#
#   .venv/bin/hf auth login

set -euo pipefail

target="${1:-}"
if [[ -z "$target" ]]; then
  echo "usage: tools/push-space.sh <owner>/<space-name>" >&2
  exit 2
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hf="$here/.venv/bin/hf"
[[ -x "$hf" ]] || hf="$(command -v hf || true)"
[[ -n "$hf" ]] || { echo "no hf CLI; pip install 'huggingface_hub[cli]'" >&2; exit 1; }

"$hf" auth whoami >/dev/null 2>&1 || {
  echo "not logged in; run: $hf auth login" >&2; exit 1; }

"$hf" repo create "$target" --repo-type space --sdk docker --exist-ok

# What the Space needs and nothing else. The corpus fonts are excluded by
# size and regenerable; node_modules and the venv have no business in an
# image that builds them itself.
# One --exclude per pattern: the flag takes a single glob.
"$hf" upload "$target" "$here" . \
  --repo-type space \
  --exclude ".git/*" \
  --exclude ".venv/*" \
  --exclude "node_modules/*" \
  --exclude "frontend/node_modules/*" \
  --exclude "frontend/dist/*" \
  --exclude "backend/data/fonts/*" \
  --exclude "backend/data/corpus.npz" \
  --exclude "backend/data/ofl-tree.json" \
  --exclude "**/__pycache__/*" \
  --exclude "tools/pending/*" \
  --commit-message "Vectorography $(cat "$here/VERSION")"

echo
echo "building at https://huggingface.co/spaces/${target}"
echo "when it is up, check it answers:"
echo "  curl https://${target/\//-}.hf.space/api/health"

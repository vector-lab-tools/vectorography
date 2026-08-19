#!/usr/bin/env bash
# Publish to a Hugging Face Space.
#
#   tools/push-space.sh <owner>/<space-name>
#
# The Space gets one commit holding the current working tree, with the fitted
# space in Git LFS. GitHub keeps the history; a Space is a deployment rather
# than a record, and rewriting this repo's history to satisfy one host would be
# the tail wagging the dog.
#
# You will be asked for your username and a write token from
# https://huggingface.co/settings/tokens — not your password.

set -euo pipefail

target="${1:-}"
if [[ -z "$target" ]]; then
  echo "usage: tools/push-space.sh <owner>/<space-name>" >&2
  exit 2
fi

command -v git-lfs >/dev/null || { echo "git-lfs is not installed" >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || {
  echo "working tree is dirty; commit or stash first" >&2; exit 1; }

remote="https://huggingface.co/spaces/${target}"
branch="space-deploy"

git lfs install --local >/dev/null
git remote get-url space >/dev/null 2>&1 || git remote add space "$remote"
git remote set-url space "$remote"

# An orphan branch: one commit, no history, LFS from the start.
git branch -D "$branch" 2>/dev/null || true
git checkout --orphan "$branch" >/dev/null 2>&1
git add -A
git commit -q -m "Vectorography $(cat VERSION) · $(git log -1 --format=%h main)"

echo "pushing to ${remote}"
git push --force space "${branch}:main"

git checkout - >/dev/null 2>&1
echo
echo "done. Watch the build at ${remote}"
echo "then check ${remote%/spaces/*}/spaces/${target} answers /api/health"

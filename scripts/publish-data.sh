#!/usr/bin/env bash
# Publish one snapshot to the data branch without touching the working tree.
set -euo pipefail
SNAP="${1:-/tmp/snapshot.json}"
test -s "$SNAP"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY yok}"
WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT
cp "$SNAP" "$WORKDIR/snapshot.json"
cd "$WORKDIR"
git init -q -b data
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
if [ -n "${GITHUB_WORKSPACE:-}" ] && [ -d "${GITHUB_WORKSPACE}/.git" ]; then
  HEADER="$(git -C "$GITHUB_WORKSPACE" config --local --get http.https://github.com/.extraheader || true)"
  if [ -n "$HEADER" ]; then
    git config http.https://github.com/.extraheader "$HEADER"
  fi
fi
git add snapshot.json
git commit -q -m "tarama: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git remote add origin "https://github.com/${REPO}.git"
git push --force origin HEAD:data

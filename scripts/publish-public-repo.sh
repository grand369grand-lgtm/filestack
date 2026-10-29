#!/usr/bin/env bash
# Create a new public GitHub repo and push this project from the user's machine.
# Authentication stays in the user's gh credential store; never paste a PAT into
# this project or its Git history.
set -euo pipefail

OWNER="${1:-}"
REPO="${2:-filestack}"

if [[ -z "$OWNER" || "$OWNER" == */* ]]; then
  echo "Usage: $0 <github-user-or-org> [repo-name]" >&2
  exit 2
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI first: https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "Sign in to GitHub in your own terminal (no token is read from this script)."
  gh auth login --hostname github.com --git-protocol https --web
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b main
else
  git branch -M main
fi

if [[ -z "$(git config --get user.name || true)" || -z "$(git config --get user.email || true)" ]]; then
  read -r -p "Git commit name: " GIT_NAME
  read -r -p "Git commit email: " GIT_EMAIL
  git config user.name "$GIT_NAME"
  git config user.email "$GIT_EMAIL"
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -m "Initial FileStack release setup"
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "An origin remote already exists: $(git remote get-url origin)" >&2
  echo "Review it before pushing; this script will not overwrite it." >&2
  exit 1
fi

gh repo create "$OWNER/$REPO" --public --source=. --remote=origin --push
printf '\nCreated and pushed https://github.com/%s/%s\n' "$OWNER" "$REPO"
printf 'Next: add the Android signing secrets, then push a version tag (e.g. v1.0.0).\n'

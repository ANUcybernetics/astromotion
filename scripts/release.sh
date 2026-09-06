#!/usr/bin/env bash
# Release helper for astromotion. See the anu-theme-sync skill.
#
# Bumps the package version, commits the bump, creates an annotated
# v<version> tag, and pushes commit + tag to origin. Refuses to run if
# the working tree is dirty, the current branch is not main, or local
# main is not in sync with origin/main.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [[ $# -lt 1 ]]; then
  cat <<EOF >&2
Usage: $0 <patch|minor|major|x.y.z> [reason]

Examples:
  $0 patch
  $0 minor "fontVariables option for the Astro 6 fonts API"
  $0 0.4.0 "reveal.js 5 -> 6 (breaking: deck CSS import paths changed)"
EOF
  exit 1
fi

bump="$1"
reason="${2:-}"

[[ -n "$(git status --porcelain)" ]] && { echo "Working tree not clean." >&2; exit 1; }
branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || { echo "Not on main (currently '$branch')." >&2; exit 1; }

git fetch --quiet
read -r behind ahead < <(git rev-list --left-right --count origin/main...HEAD)
[[ "$behind" == "0" && "$ahead" == "0" ]] \
  || { echo "Local main is $behind behind / $ahead ahead of origin/main. Sync first." >&2; exit 1; }

old="$(jq -r .version package.json)"
pnpm version "$bump" --no-git-tag-version >/dev/null
new="$(jq -r .version package.json)"
tag="v$new"

if git rev-parse "$tag" >/dev/null 2>&1; then
  git checkout -- package.json
  echo "Tag $tag already exists. Aborting." >&2
  exit 1
fi

echo "astromotion: $old -> $new (tag: $tag)"

git add package.json
git commit -m "release: astromotion $tag"

msg="astromotion $tag"
[[ -n "$reason" ]] && msg="$msg"$'\n\n'"$reason"
git tag -a "$tag" -m "$msg"

git push origin main "$tag"
echo "Released $tag."

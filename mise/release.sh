#!/bin/bash
# Release shadowmsg — version bump + git tag + push
set -e

cd "$(dirname "$0")/.."

VERSION_TYPE="${1:-patch}"

if [[ ! "$VERSION_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: $0 [major|minor|patch]"
  exit 1
fi

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree not clean"
  git status --short
  exit 1
fi

# Ensure on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on main branch (current: $BRANCH)"
  exit 1
fi

# Run tests
echo "Running tests..."
bun test
echo ""

# Calculate new version
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$VERSION_TYPE" in
  major) NEW="$((MAJOR + 1)).0.0" ;;
  minor) NEW="$MAJOR.$((MINOR + 1)).0" ;;
  patch) NEW="$MAJOR.$MINOR.$((PATCH + 1))" ;;
esac

echo "Version: $CURRENT → $NEW"

# Check tag doesn't exist
if git tag -l "v$NEW" | grep -q "v$NEW"; then
  echo "Error: tag v$NEW already exists"
  exit 1
fi

# Bump version in package.json and src/app.ts
npm version "$NEW" --no-git-tag-version --allow-same-version
sed -i '' "s/currentVersion: '${CURRENT}'/currentVersion: '${NEW}'/" src/app.ts

# Commit + tag + push
git add package.json src/app.ts
git commit -m "chore: release v$NEW"
git tag -a "v$NEW" -m "Release v$NEW"
git push origin main
git push origin "v$NEW"

echo ""
echo "✓ Released v$NEW"
echo ""
echo "Next: mise npm-publish all"

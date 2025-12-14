#!/bin/bash

set -e

# Set default version increment type if not provided
VERSION_TYPE="${1:-patch}"

# Variables to track what was created for rollback
COMMIT_SHA=""
TAG_NAME=""
ORIGINAL_VERSION=""
VERSION_BUMPED=false
TAG_CREATED=false
COMMIT_CREATED=false
PUSHED_TO_REMOTE=false

# Rollback function
rollback() {
    echo ""
    echo "[rollback] Starting rollback..."

    # Reset version in package.json if it was bumped
    if [ "$VERSION_BUMPED" = true ] && [ -n "$ORIGINAL_VERSION" ]; then
        echo "[rollback] Restoring original version $ORIGINAL_VERSION..."
        npm version "$ORIGINAL_VERSION" --no-git-tag-version --allow-same-version >/dev/null 2>&1 || true
    fi

    # Delete local tag if created
    if [ "$TAG_CREATED" = true ] && [ -n "$TAG_NAME" ]; then
        echo "[rollback] Deleting local tag $TAG_NAME..."
        git tag -d "$TAG_NAME" >/dev/null 2>&1 || true
    fi

    # Reset commit if created
    if [ "$COMMIT_CREATED" = true ]; then
        echo "[rollback] Resetting commit..."
        git reset --hard HEAD~1 >/dev/null 2>&1 || true
    fi

    # Try to delete remote tag if pushed (might fail if not pushed)
    if [ "$PUSHED_TO_REMOTE" = true ] && [ -n "$TAG_NAME" ]; then
        echo "[rollback] Attempting to delete remote tag..."
        git push origin --delete "$TAG_NAME" >/dev/null 2>&1 || true
    fi

    echo "[rollback] Rollback complete."
    echo ""
    echo "You can try again with: mise release $VERSION_TYPE"
}

# Set up trap to rollback on error
trap 'if [ $? -ne 0 ]; then rollback; fi' EXIT

# Validate version increment type
if [[ ! "$VERSION_TYPE" =~ ^(major|minor|patch)$ ]]; then
    echo "Error: Version type must be 'major', 'minor', or 'patch'"
    echo "Usage: $0 [major|minor|patch]"
    exit 1
fi

# Change to the project root directory
cd "$(dirname "$0")/.."

# Check if git repository is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Git repository is not clean. Please commit or stash your changes."
    git status --short
    exit 1
fi

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "Error: You must be on the main branch to release. Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check if remote is up to date
echo "Checking remote status..."
git fetch origin main --quiet
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "Warning: Your branch is not in sync with origin/main"
    echo "  Local:  $LOCAL_COMMIT"
    echo "  Remote: $REMOTE_COMMIT"
    echo ""
    echo "Consider running 'git pull' or 'git push' first."
    read -p "Continue anyway? (y/N): " continue_confirm
    if [[ ! "$continue_confirm" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Run tests first - fail fast if tests don't pass
echo "Running tests..."
npm test
if [ $? -ne 0 ]; then
    echo "Error: Tests failed. Please fix the tests before releasing."
    exit 1
fi

# Build the package
echo "Building package..."
npm run build

# Read current version from package.json
ORIGINAL_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $ORIGINAL_VERSION"

# Calculate new version manually to avoid any npm version side effects
CURRENT_MAJOR=$(echo $ORIGINAL_VERSION | cut -d. -f1)
CURRENT_MINOR=$(echo $ORIGINAL_VERSION | cut -d. -f2)
CURRENT_PATCH=$(echo $ORIGINAL_VERSION | cut -d. -f3)

case "$VERSION_TYPE" in
    major)
        NEW_VERSION="$((CURRENT_MAJOR + 1)).0.0"
        ;;
    minor)
        NEW_VERSION="$CURRENT_MAJOR.$((CURRENT_MINOR + 1)).0"
        ;;
    patch)
        NEW_VERSION="$CURRENT_MAJOR.$CURRENT_MINOR.$((CURRENT_PATCH + 1))"
        ;;
esac

echo "New version will be: $NEW_VERSION"

# Check if tag already exists locally
if git tag -l "v$NEW_VERSION" | grep -q "v$NEW_VERSION"; then
    echo "Error: Tag v$NEW_VERSION already exists locally."
    echo "Run: git tag -d v$NEW_VERSION"
    exit 1
fi

# Check if tag exists on remote
if git ls-remote --tags origin | grep -q "refs/tags/v$NEW_VERSION"; then
    echo "Error: Tag v$NEW_VERSION already exists on remote."
    echo "This version has likely already been released."
    exit 1
fi

# Update version in package.json and package-lock.json
echo "Updating version to $NEW_VERSION..."
npm version $NEW_VERSION --no-git-tag-version --allow-same-version
VERSION_BUMPED=true

# Verify the version was updated correctly
ACTUAL_VERSION=$(node -p "require('./package.json').version")
if [ "$ACTUAL_VERSION" != "$NEW_VERSION" ]; then
    echo "Error: Version update failed. Expected $NEW_VERSION but got $ACTUAL_VERSION"
    exit 1
fi
echo "Version updated to: $NEW_VERSION"

# Ensure oclif manifest is updated
echo "Updating oclif manifest..."
npm run prepack

# Commit version bump
echo "Committing version bump..."
git add package.json package-lock.json
# Add oclif.manifest.json if it exists (it may be gitignored)
if [ -f "oclif.manifest.json" ]; then
    git add oclif.manifest.json 2>/dev/null || true
fi
git commit -m "chore: release v$NEW_VERSION"
COMMIT_CREATED=true
COMMIT_SHA=$(git rev-parse HEAD)

# Create git tag
echo "Creating git tag..."
TAG_NAME="v$NEW_VERSION"
git tag -a "$TAG_NAME" -m "Release version $NEW_VERSION"
TAG_CREATED=true

# Ask about publishing to npm BEFORE pushing to remote
echo ""
read -p "Publish to npm? (y/N): " publish_confirm

if [[ "$publish_confirm" =~ ^[Yy]$ ]]; then
    echo "Publishing to npm..."

    # Check if logged in to npm
    if ! npm whoami &> /dev/null; then
        echo "You need to be logged in to npm. Running 'npm login'..."
        npm login
    fi

    # Publish to npm first
    if npm publish; then
        echo "✓ Package published successfully to npm"
        echo ""

        # Only push to remote AFTER successful npm publish
        echo "Pushing to remote..."
        git push origin main
        git push origin "$TAG_NAME"
        PUSHED_TO_REMOTE=true

        # Success - disable trap
        trap - EXIT

        echo "View your package at: https://www.npmjs.com/package/shadowmsg"
        echo ""
        echo "Test with:"
        echo "  npx shadowmsg --help"
        echo "  npx shadowmsg search \"test\""
    else
        echo "Error: npm publish failed"
        echo "Note: Changes were not pushed to remote."
        exit 1
    fi
else
    # User chose not to publish to npm
    echo "Skipping npm publishing."
    echo ""
    read -p "Push changes to remote anyway? (y/N): " push_confirm

    if [[ "$push_confirm" =~ ^[Yy]$ ]]; then
        echo "Pushing to remote..."
        git push origin main
        git push origin "$TAG_NAME"
        PUSHED_TO_REMOTE=true

        # Success - disable trap
        trap - EXIT

        echo "✓ Changes pushed to remote."
        echo "You can manually publish to npm later with:"
        echo "  npm publish"
    else
        echo "Changes not pushed to remote."
        echo "To push later, run:"
        echo "  git push origin main"
        echo "  git push origin $TAG_NAME"
        echo ""
        echo "To publish to npm, run:"
        echo "  npm publish"

        # Success without push - disable trap
        trap - EXIT
    fi
fi

echo ""
echo "🎉 Release complete!"
echo "Version $NEW_VERSION has been released."
echo ""
echo "Next steps:"
echo "- Create a GitHub release at: https://github.com/nacyot/shadowmsg/releases/new"
echo "- Update CHANGELOG.md if you maintain one"
echo ""
echo "Users can now run:"
echo "  npx shadowmsg --help"
echo "  npm install -g shadowmsg && sm --help"

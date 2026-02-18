#!/bin/bash
# Publish shadowmsg to npm registries
#   public  — shadowmsg → npmjs.com
#   private — @home/shadowmsg → npm.app.local
#   all     — both
set -e

cd "$(dirname "$0")/.."

TARGET="${1:-all}"
VERSION=$(node -p "require('./package.json').version")

if [[ ! "$TARGET" =~ ^(public|private|all)$ ]]; then
  echo "Usage: $0 [public|private|all]"
  exit 1
fi

publish_public() {
  echo "Publishing shadowmsg@${VERSION} → npmjs.com"
  npm publish --access public
  echo "✓ Published shadowmsg@${VERSION} (public)"
}

publish_private() {
  echo "Publishing @home/shadowmsg@${VERSION} → npm.app.local"

  # Override for private registry
  npm pkg set name='@home/shadowmsg'
  npm pkg set publishConfig.registry='http://npm.app.local/'
  npm pkg set publishConfig.access='restricted'

  npm publish

  # Restore
  git checkout package.json
  echo "✓ Published @home/shadowmsg@${VERSION} (private)"
}

echo ""

case "$TARGET" in
  public)
    publish_public
    ;;
  private)
    publish_private
    ;;
  all)
    publish_public
    echo ""
    publish_private
    ;;
esac

echo ""
echo "Done."

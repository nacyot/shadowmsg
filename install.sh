#!/bin/bash
# ShadowMSG Local Installation Script
# Installs sm command to ~/.local/bin

set -e

INSTALL_DIR="${HOME}/.local/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== ShadowMSG Installation ==="
echo ""

# Check Bun
if ! command -v bun &> /dev/null; then
    echo "Error: Bun is required"
    echo "Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
echo "✓ Bun $(bun --version)"

# Create install directory
mkdir -p "$INSTALL_DIR"
echo "✓ Install directory: $INSTALL_DIR"

# Install dependencies
echo ""
echo "Installing dependencies..."
cd "$SCRIPT_DIR" && bun install
echo "✓ Dependencies installed"

# Create wrapper script
cat > "$INSTALL_DIR/sm" << EOF
#!/bin/bash
exec bun "${SCRIPT_DIR}/src/cli.ts" "\$@"
EOF
chmod +x "$INSTALL_DIR/sm"
echo "✓ Created $INSTALL_DIR/sm"

# Also create shadowmsg alias
cat > "$INSTALL_DIR/shadowmsg" << EOF
#!/bin/bash
exec bun "${SCRIPT_DIR}/src/cli.ts" "\$@"
EOF
chmod +x "$INSTALL_DIR/shadowmsg"
echo "✓ Created $INSTALL_DIR/shadowmsg"

echo ""
echo "=== Installation Complete ==="
echo ""

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "⚠ Add $INSTALL_DIR to your PATH:"
    echo ""
    echo "  # Add to ~/.zshrc or ~/.bashrc:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
fi

echo "Usage:"
echo "  sm --help"
echo "  sm init"
echo "  sm sync run"
echo "  sm search \"keyword\""
echo "  sm push --url <endpoint> --api-key <key>"
echo ""

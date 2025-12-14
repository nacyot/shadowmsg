#!/bin/bash
# ShadowMSG Local Installation Script
# Installs sm command to ~/.local/bin

set -e

INSTALL_DIR="${HOME}/.local/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== ShadowMSG Installation ==="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18+ is required"
    echo "Current: $(node -v 2>/dev/null || echo 'not installed')"
    exit 1
fi
echo "✓ Node.js $(node -v)"

# Create install directory
mkdir -p "$INSTALL_DIR"
echo "✓ Install directory: $INSTALL_DIR"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install --prefix "$SCRIPT_DIR"
echo "✓ Dependencies installed"

# Build
echo ""
echo "Building..."
npm run build --prefix "$SCRIPT_DIR"
echo "✓ Build complete"

# Create wrapper script
cat > "$INSTALL_DIR/sm" << EOF
#!/bin/bash
exec node "${SCRIPT_DIR}/bin/run.js" "\$@"
EOF
chmod +x "$INSTALL_DIR/sm"
echo "✓ Created $INSTALL_DIR/sm"

# Also create shadowmsg alias
cat > "$INSTALL_DIR/shadowmsg" << EOF
#!/bin/bash
exec node "${SCRIPT_DIR}/bin/run.js" "\$@"
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
echo "  sm sync"
echo "  sm search \"keyword\""
echo ""

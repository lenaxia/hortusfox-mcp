#!/usr/bin/env bash
# Install git hooks for hortusfox-mcp.
# Creates .git/hooks/pre-commit that delegates to scripts/pre-commit.sh.

set -euo pipefail

HOOK_FILE=".git/hooks/pre-commit"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/pre-commit.sh"

mkdir -p .git/hooks

cat > "$HOOK_FILE" <<EOF
#!/usr/bin/env bash
exec bash "$SCRIPT" "\$@"
EOF

chmod +x "$HOOK_FILE"
chmod +x "$SCRIPT"

echo "✓ Installed pre-commit hook → $HOOK_FILE"
echo "  Delegates to: $SCRIPT"
echo ""
echo "  To bypass:  git commit --no-verify"

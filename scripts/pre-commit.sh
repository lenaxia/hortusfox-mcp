#!/usr/bin/env bash
# Pre-commit hook for hortusfox-mcp.
#
# Runs: gitleaks (if installed), eslint, prettier --check, tsc --noEmit.
# Blocks commit on any failure.
#
# To install:  bash scripts/install-hooks.sh
# To bypass:   git commit --no-verify (emergency only)

set -euo pipefail

echo "── Running pre-commit checks ──"
fail=0

# 1. Gitleaks (secrets scan) — only if installed
if command -v gitleaks &>/dev/null; then
  echo "  ▸ gitleaks"
  if ! gitleaks protect --staged --redact -c .gitleaks.toml --no-banner; then
    echo "  ✗ gitleaks found potential secrets — commit blocked"
    fail=1
  fi
else
  echo "  ▸ gitleaks (skipped — not installed)"
fi

# 2. ESLint
echo "  ▸ eslint"
if ! npx --no-install eslint src test 2>&1; then
  echo "  ✗ eslint failed"
  fail=1
fi

# 3. Prettier format check
echo "  ▸ prettier"
if ! npx --no-install prettier --check "src/**/*.ts" "test/**/*.ts" 2>&1; then
  echo "  ✗ prettier check failed — run 'npm run format' and re-stage"
  fail=1
fi

# 4. TypeScript type check
echo "  ▸ tsc --noEmit"
if ! npx --no-install tsc --noEmit 2>&1; then
  echo "  ✓ typecheck failed"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "✗ Pre-commit checks failed. Fix the issues above or use --no-verify to bypass."
  exit 1
fi

echo ""
echo "✓ All pre-commit checks passed"

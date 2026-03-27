#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PASS=0
FAIL=0

pass() {
  echo "PASS: $1"
  : $((PASS += 1))
}

fail() {
  echo "FAIL: $1"
  : $((FAIL += 1))
}

# ---------- Check 1: SYS_ADMIN absent from runArgs ----------
if jq -e '.runArgs[]? | select(test("SYS_ADMIN"))' "$REPO_ROOT/devcontainer.json" >/dev/null 2>&1; then
  fail "SYS_ADMIN found in runArgs"
else
  pass "SYS_ADMIN not in runArgs"
fi

# ---------- Check 2: .devcontainer/ mount is read-only ----------
if jq -e '[.mounts[] | select(contains("target=/workspace/.devcontainer") and contains("readonly"))] | length > 0' "$REPO_ROOT/devcontainer.json" 2>/dev/null | grep -q true; then
  pass ".devcontainer mount is read-only"
else
  fail ".devcontainer mount is not read-only"
fi

# ---------- Check 3: Deny rule present in .claude/settings.json ----------
if jq -e '[.permissions.deny[] | select(. == "Read(.devcontainer/**)") ] | length > 0' "$REPO_ROOT/.claude/settings.json" 2>/dev/null | grep -q true; then
  pass "deny rule Read(.devcontainer/**) present"
else
  fail "deny rule Read(.devcontainer/**) missing"
fi

# ---------- Check 4: bypassPermissions NOT in repo settings ----------
if jq -e '.permissions.defaultMode' "$REPO_ROOT/.claude/settings.json" 2>/dev/null | grep -q bypassPermissions; then
  fail "bypassPermissions found in repo settings.json (should only be set at runtime by post_install.py)"
else
  pass "bypassPermissions not in repo settings.json (set at runtime only)"
fi

# ---------- Summary ----------
echo ""
echo "Security checks: $((PASS + FAIL)), Passed: $PASS, Failed: $FAIL"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi

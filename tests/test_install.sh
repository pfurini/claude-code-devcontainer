#!/bin/bash
set -euo pipefail

# Resolve script directory and source install.sh (source guard prevents main from running)
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$TESTS_DIR/fixtures"
PROJECT_ROOT="$(cd "$TESTS_DIR/.." && pwd)"

source "$PROJECT_ROOT/install.sh"

# --- Test harness ---
PASS=0
FAIL=0
TMPDIR_TEST=""

cleanup() {
  [[ -n "$TMPDIR_TEST" ]] && rm -rf "$TMPDIR_TEST"
}
trap cleanup EXIT

TMPDIR_TEST=$(mktemp -d)

assert_exit() {
  local expected="$1" desc="$2"; shift 2
  local got
  if ("$@") >/dev/null 2>&1; then got=0; else got=$?; fi
  if [[ "$got" -eq "$expected" ]]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected=$expected got=$got)"
    FAIL=$((FAIL + 1))
  fi
}

assert_eq() {
  local expected="$1" actual="$2" desc="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected='$expected' got='$actual')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" desc="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected to contain '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_empty() {
  local value="$1" desc="$2"
  if [[ -n "$value" ]]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected non-empty)"
    FAIL=$((FAIL + 1))
  fi
}

assert_empty() {
  local value="$1" desc="$2"
  if [[ -z "$value" ]]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected empty, got '$value')"
    FAIL=$((FAIL + 1))
  fi
}

# ============================================================
# check_no_sys_admin tests
# ============================================================
echo "--- check_no_sys_admin ---"

# Test: no devcontainer.json -> exit 0
ws_empty="$TMPDIR_TEST/ws_empty"
mkdir -p "$ws_empty/.devcontainer"
assert_exit 0 "no devcontainer.json -> exit 0" check_no_sys_admin "$ws_empty"

# Test: SYS_ADMIN in runArgs -> exit 1
ws_sysadmin="$TMPDIR_TEST/ws_sysadmin"
mkdir -p "$ws_sysadmin/.devcontainer"
cp "$FIXTURES_DIR/devcontainer_sys_admin.json" "$ws_sysadmin/.devcontainer/devcontainer.json"
assert_exit 1 "SYS_ADMIN in runArgs -> exit 1" check_no_sys_admin "$ws_sysadmin"

# Test: NET_ADMIN only -> exit 0
ws_netadmin="$TMPDIR_TEST/ws_netadmin"
mkdir -p "$ws_netadmin/.devcontainer"
cp "$FIXTURES_DIR/devcontainer_no_sys_admin.json" "$ws_netadmin/.devcontainer/devcontainer.json"
assert_exit 0 "NET_ADMIN only -> exit 0" check_no_sys_admin "$ws_netadmin"

# Test: empty runArgs -> exit 0
ws_emptyrun="$TMPDIR_TEST/ws_emptyrun"
mkdir -p "$ws_emptyrun/.devcontainer"
cp "$FIXTURES_DIR/devcontainer_empty_runargs.json" "$ws_emptyrun/.devcontainer/devcontainer.json"
assert_exit 0 "empty runArgs -> exit 0" check_no_sys_admin "$ws_emptyrun"

# Test: malformed JSON -> exit 0 (jq fails silently)
ws_malformed="$TMPDIR_TEST/ws_malformed"
mkdir -p "$ws_malformed/.devcontainer"
cp "$FIXTURES_DIR/devcontainer_malformed.json" "$ws_malformed/.devcontainer/devcontainer.json"
assert_exit 0 "malformed JSON -> exit 0" check_no_sys_admin "$ws_malformed"

# ============================================================
# extract_mounts_to_file tests
# ============================================================
echo "--- extract_mounts_to_file ---"

# Test: missing file -> returns 0, empty output
result=$(extract_mounts_to_file "$TMPDIR_TEST/nonexistent.json")
assert_empty "$result" "missing file -> empty output"

# Test: default mounts only -> returns empty (no custom mounts)
result=$(extract_mounts_to_file "$FIXTURES_DIR/devcontainer_default_mounts.json")
assert_empty "$result" "default mounts only -> empty output"

# Test: custom mount present -> returns temp file path
result=$(extract_mounts_to_file "$FIXTURES_DIR/devcontainer_custom_mount.json")
assert_not_empty "$result" "custom mount -> non-empty output (temp file path)"
if [[ -n "$result" ]]; then
  content=$(cat "$result")
  assert_contains "$content" "/workspace/data" "custom mount file contains target path"
  rm -f "$result"
fi

# Test: mixed mounts -> returns temp file with only custom mounts
result=$(extract_mounts_to_file "$FIXTURES_DIR/devcontainer_mixed_mounts.json")
assert_not_empty "$result" "mixed mounts -> non-empty output"
if [[ -n "$result" ]]; then
  content=$(cat "$result")
  assert_contains "$content" "/workspace/data" "mixed: contains custom mount /workspace/data"
  assert_contains "$content" "/workspace/secrets" "mixed: contains custom mount /workspace/secrets"
  # Verify default mounts are NOT present
  if [[ "$content" != *"/commandhistory"* ]]; then
    echo "PASS: mixed: does not contain default mount /commandhistory"
    PASS=$((PASS + 1))
  else
    echo "FAIL: mixed: should not contain default mount /commandhistory"
    FAIL=$((FAIL + 1))
  fi
  rm -f "$result"
fi

# ============================================================
# update_devcontainer_mounts tests
# ============================================================
echo "--- update_devcontainer_mounts ---"

# Test: add a new mount to a file with existing mounts
test_dc="$TMPDIR_TEST/update_test1.json"
echo '{"mounts": ["source=/existing,target=/workspace/existing,type=bind"]}' > "$test_dc"
update_devcontainer_mounts "$test_dc" "/newdata" "/workspace/newdata" "false"
updated=$(cat "$test_dc")
assert_contains "$updated" "/workspace/newdata" "add new mount -> mount present"
assert_contains "$updated" "/workspace/existing" "add new mount -> existing mount preserved"

# Test: add a readonly mount -> output contains "readonly"
test_dc="$TMPDIR_TEST/update_test2.json"
echo '{"mounts": []}' > "$test_dc"
update_devcontainer_mounts "$test_dc" "/rodata" "/workspace/rodata" "true"
updated=$(cat "$test_dc")
assert_contains "$updated" "readonly" "readonly mount -> contains readonly"

# Test: replace mount with same target -> only one mount with that target
test_dc="$TMPDIR_TEST/update_test3.json"
echo '{"mounts": ["source=/old,target=/workspace/replaced,type=bind"]}' > "$test_dc"
update_devcontainer_mounts "$test_dc" "/new" "/workspace/replaced" "false"
updated=$(cat "$test_dc")
# Count occurrences of the target
count=$(echo "$updated" | jq '[.mounts[] | select(contains("target=/workspace/replaced"))] | length')
assert_eq "1" "$count" "replace mount -> exactly one mount with target"

# ============================================================
# get_workspace_folder tests
# ============================================================
echo "--- get_workspace_folder ---"

# Test: with explicit argument
result=$(get_workspace_folder "/some/path")
assert_eq "/some/path" "$result" "get_workspace_folder with arg -> returns arg"

# Test: without args -> returns pwd
result=$(get_workspace_folder)
expected=$(pwd)
assert_eq "$expected" "$result" "get_workspace_folder no args -> returns pwd"

# ============================================================
# main arg parsing tests
# ============================================================
echo "--- main arg parsing ---"

# Test: no args -> exit 1
assert_exit 1 "main no args -> exit 1" main

# Test: unknown command -> exit 1
assert_exit 1 "main unknown command -> exit 1" main foobar

# Test: help command -> exit 0
assert_exit 0 "main help -> exit 0" main help

# Test: --help flag -> exit 0
assert_exit 0 "main --help -> exit 0" main --help

# Test: known command (up) with docker mock -> dispatches without parse error
docker() { return 0; }
devcontainer() { return 0; }
export -f docker devcontainer
assert_exit 0 "main 'up .' with mocked docker -> exit 0" main up .
unset -f docker devcontainer

# ============================================================
# Summary
# ============================================================
echo ""
echo "========================================="
echo "Tests: $((PASS + FAIL)), Passed: $PASS, Failed: $FAIL"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

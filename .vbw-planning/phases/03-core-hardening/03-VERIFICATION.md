---
phase: 03-core-hardening
tier: standard
result: PASS
passed: 22
failed: 0
total: 22
date: 2026-03-27
---

## Must-Have Checks

| # | ID | Truth/Condition | Status | Evidence |
|---|-----|-----------------|--------|----------|
| 1 | MH-01 | install.sh can be sourced without executing main (BASH_SOURCE guard present) | PASS | Line 864: if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi — source guard confirmed |
| 2 | MH-02 | All unit tests pass with exit code 0 | PASS | bash tests/test_install.sh: Tests: 24, Passed: 24, Failed: 0 |
| 3 | MH-03 | SYS_ADMIN is not in devcontainer.json runArgs | PASS | bash tests/test_security.sh: PASS: SYS_ADMIN not in runArgs |
| 4 | MH-04 | .devcontainer/ mount has readonly flag in devcontainer.json | PASS | devcontainer.json mounts contains: source=.../.devcontainer,...,readonly |
| 5 | MH-05 | deny rule Read(.devcontainer/**) exists in .claude/settings.json | PASS | .claude/settings.json permissions.deny contains Read(.devcontainer/**) |
| 6 | MH-06 | CI workflow triggers on pull_request events | PASS | .github/workflows/ci.yml on.pull_request.branches: [main] |
| 7 | MH-07 | CI has lint, test, and security jobs | PASS | ci.yml jobs: lint (shellcheck), test (test_install.sh), security (hadolint + test_security.sh) |
| 8 | MH-08 | No Docker build occurs in CI | PASS | grep 'docker build' ci.yml returned no matches |

## Artifact Checks

| # | ID | Artifact | Status | Evidence |
|---|-----|----------|--------|----------|
| 1 | ART-01 | install.sh provides source guard containing BASH_SOURCE | PASS | grep 'BASH_SOURCE' install.sh: line 8 and line 864 — both present |
| 2 | ART-02 | tests/test_install.sh provides unit tests containing check_no_sys_admin | PASS | tests/test_install.sh exists; grep finds check_no_sys_admin at multiple lines |
| 3 | ART-03 | tests/test_install.sh contains extract_mounts_to_file tests | PASS | grep finds extract_mounts_to_file at line 117+ in test_install.sh |
| 4 | ART-04 | tests/fixtures/devcontainer_sys_admin.json contains SYS_ADMIN | PASS | File content: {"runArgs": ["--cap-add=SYS_ADMIN"]} |
| 5 | ART-05 | tests/test_security.sh provides security assertions (SYS_ADMIN, readonly, Read(.devcontainer/**)) | PASS | All 3 patterns found in test_security.sh at expected lines |
| 6 | ART-06 | .hadolint.yaml provides hadolint config containing DL3008 | PASS | .hadolint.yaml: ignored: [DL3008] — only DL3008 suppressed |
| 7 | ART-07 | .github/workflows/ci.yml contains pull_request, shellcheck, test_install.sh, hadolint, test_security.sh | PASS | All 5 required strings confirmed present in ci.yml |

## Key Link Checks

| # | ID | Link | Status | Evidence |
|---|-----|------|--------|----------|
| 1 | KL-01 | tests/test_install.sh sources install.sh | PASS | test_install.sh: source $(dirname $0)/../install.sh — link verified |
| 2 | KL-02 | ci.yml invokes tests/test_install.sh via bash | PASS | ci.yml test job run: bash tests/test_install.sh |
| 3 | KL-03 | ci.yml invokes tests/test_security.sh via bash | PASS | ci.yml security job run: bash tests/test_security.sh |
| 4 | KL-04 | ci.yml uses .hadolint.yaml config via hadolint | PASS | ci.yml security job: hadolint Dockerfile (reads .hadolint.yaml from repo root automatically) |

## Anti-Pattern Scan

| # | ID | Pattern | Status | Evidence |
|---|-----|---------|--------|----------|
| 1 | AP-01 | No external test framework dependencies (bats, shunit2, npm install) | PASS | grep for bats/shunit2/npm install in tests/ returned no matches |
| 2 | AP-02 | Test scripts use set -euo pipefail (convention compliance) | PASS | Both test_install.sh and test_security.sh have 'set -euo pipefail' as second line |
| 3 | AP-03 | CI jobs are parallel — no unnecessary sequential dependencies via 'needs' | PASS | grep 'needs:' ci.yml returned no matches — all 3 jobs run in parallel |

## Summary

**Tier:** standard
**Result:** PASS
**Passed:** 22/22
**Failed:** None

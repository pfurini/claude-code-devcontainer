# Phase 3: Core Hardening — Context

Gathered: 2026-03-27
Calibration: architect

## Phase Boundary
Improve container security, add testing, and set up CI/CD pipeline. Deliverables: automated tests for install.sh functions, a CI pipeline that runs on PR, and automated security checks that pass.

## Decisions

### Test Strategy
- Framework: ShellCheck + raw shell assertions (zero external dependencies, matches project constraint)
- Two-tier Docker testing: pure logic tests always run; Docker integration tests gated on `DOCKER_AVAILABLE=true`
- No bats-core or other test framework dependencies

### CI Pipeline Design
- Platform: GitHub Actions
- Scope: ShellCheck lint + unit tests + hadolint (Dockerfile lint)
- No actual container build in CI — static checks only for fast feedback
- Layout: single workflow (`ci.yml`) with multiple jobs (lint, test, security)

### Security Audit Scope
- Automated checks only — no manual markdown checklist
- Checks: ShellCheck security rules, hadolint, verify SYS_ADMIN is blocked, verify .devcontainer/ is read-only mount, verify deny rules in settings.json
- Security checks run as a job within the single CI workflow

### Test Coverage Boundaries
- Critical paths only: extract_mounts_to_file(), cmd_sync(), discover_resources(), check_no_sys_admin(), arg parsing
- Skip straightforward wrappers (cmd_shell, etc.)
- Minimal refactoring: add source guard (`if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi`) so test scripts can source functions directly
- No structural overhaul or library extraction

### Open (Claude's discretion)
- Test file location (e.g., `tests/` directory)
- Specific hadolint rules to enable/disable
- GitHub Actions runner image (ubuntu-latest)
- ShellCheck severity threshold for CI failure

## Deferred Ideas

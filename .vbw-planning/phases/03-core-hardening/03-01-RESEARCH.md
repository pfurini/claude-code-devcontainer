---
phase: "03"
title: "Core Hardening — Codebase Research"
type: research
confidence: high
date: 2026-03-27
---

## Findings

### 1. install.sh Structure and Testability

**Current entrypoint (line 864):**
```bash
main "$@"
```
This is unconditional — `main` is always called when the script is sourced or executed. Adding a source guard is a minimal, safe change:
```bash
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
```
No structural overhaul is needed. Test scripts can then `source install.sh` and call individual functions directly.

**Script layout summary:**
- Lines 1–22: shebang, `set -euo pipefail`, SCRIPT_DIR resolution, color constants
- Lines 24–98: `print_usage`, log helpers (`log_info/success/warn/error`), `check_devcontainer_cli`, `check_no_sys_admin`
- Lines 100–184: Pure logic helpers: `get_workspace_folder`, `extract_mounts_to_file`, `merge_mounts_from_file`, `update_devcontainer_mounts`
- Lines 186–798: `cmd_*` functions (all Docker-dependent or interactive except their argument-parsing logic)
- Lines 800–864: `main` dispatcher

**Function purity classification:**

| Function | Pure / Testable | Docker Required |
|---|---|---|
| `log_info/warn/error/success` | Pure (stdout/stderr) | No |
| `get_workspace_folder` | Pure | No |
| `extract_mounts_to_file` | Pure (jq + file I/O) | No |
| `merge_mounts_from_file` | Pure (jq + file I/O) | No |
| `update_devcontainer_mounts` | Pure (jq + file I/O) | No |
| `check_no_sys_admin` | Pure (jq + file read) | No |
| `cmd_sync` arg parsing | Pure (argument loop) | No |
| `discover_resources` | Docker-dependent | Yes |
| `sync_get_project_name` | Docker-dependent | Yes |
| `sync_get_claude_projects_dir` | Docker-dependent | Yes |
| `sync_one_container` | Docker-dependent | Yes |
| All `cmd_up/rebuild/down/shell/exec/upgrade/mount` | Docker-dependent | Yes |
| `cmd_update` | Git-dependent | No (but needs git repo) |
| `cmd_self_install` | Filesystem I/O | No |

### 2. Critical Functions: Deep-Dive

#### `extract_mounts_to_file` (lines 112–144)
- Takes one arg: `devcontainer_json` path
- Returns early (`return 0`) if file does not exist — safe
- Creates a `mktemp` temp file unconditionally; deletes it if no custom mounts found
- Uses `jq` to filter out 8 known default mount target paths (docker.sock, commandhistory, .claude, .config/gh, .gitconfig, .devcontainer, .agents, CLAUDE.md, skills)
- Returns the temp file path (via `echo`) if custom mounts exist, empty string otherwise
- **Test surface**: provide a devcontainer.json with known/custom mounts and assert the temp file content. Test with: no custom mounts (returns empty), only default mounts (returns empty), one custom mount (returns path), missing file (returns empty). The `|| true` on jq prevents exit on malformed JSON — this is testable.

#### `cmd_sync` (lines 344–436)
- Parses `--trusted` flag and an optional filter string in a `while` loop
- When `trusted=false`, prompts for confirmation (interactive — test with `--trusted`)
- After arg parsing, calls `docker ps -a` — Docker-dependent
- **Testable without Docker**: only the argument parsing loop (lines 347–359). To test the filter/trusted logic in isolation, the docker calls would need mocking or environment stubs. The context decision says this is a Docker-gated test.
- **Edge case**: the filter applies `grep -qi` (case-insensitive) against the project name derived from container labels.

#### `discover_resources` (lines 652–688)
- Sets four global variables: `CONTAINER_ID`, `CONTAINER_STATUS`, `VOLUMES` (array), `IMAGE`, `IMAGE_UID`
- Returns early (`return 0`) if no container found — callers must check `$CONTAINER_ID`
- IMAGE / IMAGE_UID: strips `-uid` suffix if present, adds it otherwise
- **Fully Docker-dependent** — not testable without Docker. Gated test needed.
- **Test surface (Docker-gated)**: create a test container with the `devcontainer.local_folder` label and assert the globals are populated correctly.

#### `check_no_sys_admin` (lines 87–98)
- Takes one arg: `workspace` (defaults to `.`)
- Reads `$workspace/.devcontainer/devcontainer.json`
- Uses `jq -e` to check `.runArgs[]? | select(test("SYS_ADMIN"))` — exits 1 if found
- Returns 0 silently if file does not exist
- **Pure, testable**: create a temp dir with a devcontainer.json containing/not containing SYS_ADMIN in runArgs. Assert exit codes. This is the most critical security property to test.
- **Test cases needed**:
  - No devcontainer.json → exit 0
  - devcontainer.json with `--cap-add=NET_ADMIN` only → exit 0
  - devcontainer.json with `--cap-add=SYS_ADMIN` → exit 1
  - devcontainer.json with empty runArgs → exit 0
  - Malformed JSON → exit 0 (jq returns nonzero but `>/dev/null 2>&1` suppresses, whole expression is `if jq ...; then exit 1; fi` — actually jq fails silently and the if-test is false, so exit 0)

#### Arg parsing in `main` (lines 800–862)
- Simple `case` statement, no complex parsing
- Unknown command → `log_error` + `print_usage` + `exit 1`
- No args → `print_usage` + `exit 1`
- The `exec` subcommand strips a leading `--` before forwarding: `[[ "${1:-}" == "--" ]] && shift`
- **Pure, testable**: source the script and call `main <subcommand>` (with source guard in place). For commands that would call Docker, mock by overriding `docker` as a function in the test.

#### `update_devcontainer_mounts` (lines 166–184)
- Builds a `source=...,target=...,type=bind` mount string
- Appends `,readonly` if `readonly=true`
- Uses jq to filter out existing mount with same target, then appends the new one
- **Pure, testable**: provide devcontainer.json fixture, call function, assert jq output. Tests: add new mount, replace existing mount with same target, add readonly mount.

### 3. Security Verification Points

**3a. SYS_ADMIN blocked in devcontainer.json**
Current `runArgs` (devcontainer.json, lines 17–20):
```json
"runArgs": ["--cap-add=NET_ADMIN", "--cap-add=NET_RAW"]
```
`SYS_ADMIN` is absent. The automated check is `check_no_sys_admin`. This can be verified statically:
```bash
# In CI security job:
jq -e '.runArgs[]? | select(test("SYS_ADMIN"))' devcontainer.json && exit 1 || true
```

**3b. `.devcontainer/` mounted read-only**
`devcontainer.json` line 52:
```
"source=${localWorkspaceFolder}/.devcontainer,target=/workspace/.devcontainer,type=bind,readonly"
```
The `readonly` keyword is present. Automated check:
```bash
jq -e '.mounts[] | select(contains("target=/workspace/.devcontainer")) | select(contains("readonly"))' devcontainer.json
```

**3c. Deny rules in `.claude/settings.json`**
Current content:
```json
{"permissions": {"deny": ["Read(.devcontainer/**)"]} }
```
Automated check:
```bash
jq -e '.permissions.deny[] | select(. == "Read(.devcontainer/**)")' .claude/settings.json
```

**3d. `bypassPermissions` written by post_install.py**
`setup_claude_settings()` sets `permissions.defaultMode = "bypassPermissions"`. This is deliberate and documented. Not a security concern — it's the sandbox design. No CI check needed for this (it's correct behavior).

**3e. Auth token isolation**
`setup_onboarding_bypass()` reads `ANTHROPIC_AUTH_TOKEN` from env and writes to three credential paths. Token never written to workspace, only `~/.claude/` and `~/.config/claude/`. No special CI check needed — static review sufficient.

**3f. `expiry` value in credentials**
`post_install.py` line 42: `"expiresAt": 9999999999999` — far-future expiry. This is intentional for the sandbox use case. Not a defect.

### 4. Dockerfile Linting (hadolint)

**Patterns likely to trigger hadolint warnings:**

| Line(s) | Pattern | Expected Rule |
|---|---|---|
| 14–56 | `apt-get install -y` without version pinning | DL3008 (pin versions) |
| 61–63 | `curl` piped directly to bash (`curl ... \| bash`) — line 99 | DL3016 / SC2046 |
| 99 | `curl ... \| bash` for Claude Code install | DL4006 (set pipefail in pipes) |
| 113 | `curl ... \| bash` for fnm install | DL4006 |
| 127 | `curl ... \| bash` for Homebrew install | DL4006 |
| 60–76 | Intermediate variable `ARCH` in RUN — fine, but arch-detection pattern repeated | — |
| 4, 6 | Multi-stage `FROM` with digest pinning (sha256) — good practice, no warning | — |

The `SHELL ["/bin/bash", "-o", "pipefail", "-c"]` at line 11 sets pipefail for `RUN` commands — this satisfies DL4006 for most patterns. The `curl | bash` pattern will still trigger DL3016 (no version pin on external installs).

**Recommended hadolint config** (`.hadolint.yaml`):
```yaml
ignore:
  - DL3008  # apt pin versions — managed via ARG-pinned source images instead
  - DL3016  # npm pin versions — not applicable here
```
The `curl | bash` installs (Claude Code, fnm, Homebrew) are the biggest hadolint surface. These may need `# hadolint ignore=DL3016` inline comments or a project-level ignore list if the external installers cannot be pinned differently.

### 5. Existing CI

The only `.github/` content found is `.github/CODEOWNERS`:
```
* @dguido @computerality @DarkaMaul @disconnect3d
```
**No `.github/workflows/` directory exists.** CI must be created from scratch.

### 6. post_install.py Security-Relevant Logic

**`setup_onboarding_bypass()` (lines 19–73)**
- Reads `ANTHROPIC_AUTH_TOKEN` from env — correct, no hardcoded secret
- Writes token as both `accessToken` AND `refreshToken` — refresh token = access token (intentional workaround for issue #8938)
- `expiresAt: 9999999999999` — epoch ms, far future (~year 2316). No rotation risk in sandbox
- Writes to three paths: `~/.claude/.credentials.json`, `~/.claude/credentials.json`, `~/.config/claude/.credentials.json`
- **Security property**: token only lives inside the container's ephemeral filesystem or the `devc-*-config-*` named volume. It does not escape to the host workspace.

**`setup_claude_settings()` (lines 76–97)**
- Merges into existing settings (does not overwrite entire file) — preserves other settings
- Only sets `permissions.defaultMode = "bypassPermissions"` — the deny rules in `.claude/settings.json` come from the mounted source, not from `post_install.py`
- **Risk**: if `settings.json` already exists in the config volume with different permissions, the merge preserves them. This is intentional (volume persistence).

**`fix_directory_ownership()` (lines 147–177)**
- Runs `sudo chown -R` on `/commandhistory`, `~/.claude`, `~/.config/gh`
- Does not chown `/workspace` or the `.devcontainer` bind mount — correct
- Catches `PermissionError` and `CalledProcessError` gracefully (warns, does not abort)

**`setup_global_gitignore()` (lines 179–271)**
- Creates `~/.gitignore_global` and `~/.gitconfig.local` that includes the host's `~/.gitconfig` via `[include]`
- The `GIT_CONFIG_GLOBAL` env var in devcontainer.json points git to `~/.gitconfig.local`
- Host `.gitconfig` is mounted read-only — the local config wraps it, adding delta and excludesfile

## Relevant Patterns

### Source Guard Pattern
```bash
# At the bottom of install.sh, replacing line 864:
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
```
This is the only required change to install.sh to enable testing.

### Test Script Pattern (no bats-core)
```bash
#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/../install.sh"

PASS=0; FAIL=0
assert_exit() {
  local expected=$1 desc=$2; shift 2
  if (eval "$@") 2>/dev/null; then local got=0; else local got=$?; fi
  if [[ $got -eq $expected ]]; then echo "PASS: $desc"; ((PASS++))
  else echo "FAIL: $desc (expected=$expected got=$got)"; ((FAIL++)); fi
}
```

### jq-based Security Assertions (CI script)
```bash
# Verify SYS_ADMIN blocked
jq -e '.runArgs[]? | select(test("SYS_ADMIN"))' devcontainer.json \
  && { echo "FAIL: SYS_ADMIN found in runArgs"; exit 1; } \
  || echo "PASS: SYS_ADMIN not in runArgs"

# Verify .devcontainer/ read-only
jq -e '[.mounts[] | select(contains("target=/workspace/.devcontainer") and contains("readonly"))] | length > 0' \
  devcontainer.json | grep -q true \
  || { echo "FAIL: .devcontainer not mounted read-only"; exit 1; }

# Verify deny rule
jq -e '[.permissions.deny[] | select(. == "Read(.devcontainer/**)") ] | length > 0' \
  .claude/settings.json | grep -q true \
  || { echo "FAIL: deny rule missing"; exit 1; }
```

### GitHub Actions Layout
```
.github/
  workflows/
    ci.yml          # single workflow: lint + test + security jobs
.hadolint.yaml      # hadolint ignore rules
tests/
  test_install.sh   # pure unit tests (always run)
  test_security.sh  # static security assertions (always run)
```

## Risks

1. **`set -euo pipefail` + sourcing**: The script uses `set -euo pipefail` at the top. When sourced by a test script, these options carry over. Test scripts must either use `set +e` selectively for testing exit-code assertions, or wrap calls in subshells.

2. **Global variables in `discover_resources`**: The function sets `CONTAINER_ID`, `VOLUMES`, `IMAGE`, etc. as unscoped globals. Test scripts sourcing the file need to be aware these will leak. Docker-gated tests should clean up after each test case.

3. **`mktemp` in `extract_mounts_to_file`**: Temp files are created and conditionally deleted. If a test aborts mid-run, orphaned temp files are possible. Tests should use `trap` for cleanup.

4. **Homebrew in Dockerfile**: `brew install` pins no versions (line 129). If one of `gcloud-cli firebase-cli vercel-cli gh postgresql@17 agent-browser` changes its semver, builds may break silently. Hadolint will not catch this (Homebrew formula pinning is not a hadolint rule). Low risk for CI-only static checks, but relevant for Dockerfile review.

5. **`curl | bash` pattern**: Claude Code, fnm, and Homebrew are all installed via `curl | bash` with no checksum verification. This is an accepted risk for this project (external installer pattern), but hadolint will flag it. The project should decide which rules to suppress vs. accept.

6. **No `postCreateCommand` in CI**: The CI workflow cannot run the container build. Any test of `post_install.py` behavior must be unit-level (mock the filesystem, env). The context decision already calls for static checks only in CI — this is consistent.

## Recommendations

### R1: Source Guard (minimal change)
Replace line 864 of `install.sh` (`main "$@"`) with:
```bash
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
```
This is the only required change to `install.sh`.

### R2: Test File Structure
Create `tests/` directory with:
- `tests/test_install.sh` — pure tests (always run in CI): `check_no_sys_admin`, `extract_mounts_to_file`, `update_devcontainer_mounts`, `merge_mounts_from_file`, `get_workspace_folder`, arg parsing
- `tests/test_security.sh` — static security assertions against `devcontainer.json` and `.claude/settings.json`
- `tests/fixtures/` — sample devcontainer.json files for test cases

### R3: CI Workflow Structure (`.github/workflows/ci.yml`)
```yaml
jobs:
  lint:       # shellcheck on install.sh + post_install.py (pylint/ruff optional)
  test:       # bash tests/test_install.sh
  security:   # hadolint on Dockerfile + bash tests/test_security.sh
```
All jobs: `runs-on: ubuntu-latest`, no Docker build required.

### R4: ShellCheck Configuration
`install.sh` uses `set -euo pipefail` and `read -p` (bash-specific). ShellCheck should target `bash` explicitly:
```bash
shellcheck -s bash install.sh
```
ShellCheck will flag `SC2034` (color variables unused outside subshells) — consider `# shellcheck disable=SC2034` or restructuring the color variable declarations.

### R5: hadolint Configuration
Create `.hadolint.yaml` with targeted ignores. The `curl | bash` installs and unpinned `apt-get` packages are the primary surface. Suggested starting point:
```yaml
ignore:
  - DL3008  # apt-get version pinning — upstream images are digest-pinned
```
Leave `DL3016` enabled to catch future `npm install -g` additions without pinning.

### R6: Security Test Assertions (exhaustive list)
Four jq-based assertions for `tests/test_security.sh`:
1. `SYS_ADMIN` absent from `devcontainer.json` `runArgs`
2. `.devcontainer/` mount has `readonly` flag
3. `deny` array in `.claude/settings.json` contains `Read(.devcontainer/**)`
4. `bypassPermissions` is intentionally set (document as expected, not a failure)

### R7: Test for `extract_mounts_to_file` Filter Logic
The 8 default target paths in the filter are the core logic of mount preservation. Tests must cover:
- Empty mounts array → empty output
- All default mounts → empty output (no custom mounts file created)
- One non-default mount → file created with that mount
- Mix of default + custom → file created with only custom
- Invalid/missing file → function returns 0, empty output

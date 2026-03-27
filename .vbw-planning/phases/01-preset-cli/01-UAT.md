---
phase: 01
status: issues_found
started: 2026-03-27
completed:
tests_total: 3
tests_passed: 0
tests_failed: 1
tests_skipped: 2
---

# Phase 01: Preset CLI — UAT

## P03-T01: Interactive TUI Experience

**Scenario:** Run `cd cli && npm install && npm link` to install, then run bare `claude-preset` in any directory. The interactive TUI should launch with a welcome message, display a multiselect with available presets (nextjs, convex), and allow selection/deselection before confirming.

**Expected:** The TUI is intuitive — presets are clearly labeled with descriptions, selection works smoothly, and cancelling exits gracefully without errors.

**Result:** SKIP — Cannot test until container builds

---

## P03-T02: Preset Apply and Review Generated Config

**Scenario:** In a test directory, run `claude-preset apply nextjs`. Then review the generated files: `.claude/settings.json` (should have npm/npx permissions and telemetry env), `.mcp.json` (should have next-devtools server entry), and `CLAUDE.md` (should have an `@.claude/presets/nextjs.md` import line). Open `.claude/presets/nextjs.md` and read the guidance content.

**Expected:** The generated configuration files are well-structured, the CLAUDE.md guidance for Next.js App Router is practical and accurate (covers Server Components, Route Handlers, Server Actions, etc.), and the overall preset looks useful for a real Next.js project.

**Result:** SKIP — Cannot test until container builds

---

## P03-T03: Container Build with claude-preset

**Scenario:** Docker build fails with `"/cli": not found` because `install.sh cmd_template()` copies Dockerfile, devcontainer.json, post_install.py, and .zshrc to `.devcontainer/` but not `cli/`. The devcontainer build context defaults to `.devcontainer/` so COPY can't find `cli/`.

**Expected:** Container builds successfully with claude-preset CLI installed and available on PATH.

**Result:** FAIL — `/cli` not found in build context. Root cause: `install.sh` missing `cp -r "$SCRIPT_DIR/cli" "$devcontainer_dir/"` in `cmd_template()`. **Severity: critical** (container cannot build at all).**

---
phase: 01
status: complete
started: 2026-03-27
completed: 2026-03-27
tests_total: 3
tests_passed: 3
tests_failed: 0
tests_skipped: 0
---

# Phase 01: Preset CLI — UAT

## P03-T01: Interactive TUI Experience

**Scenario:** Run `cd cli && npm install && npm link` to install, then run bare `claude-preset` in any directory. The interactive TUI should launch with a welcome message, display a multiselect with available presets (nextjs, convex), and allow selection/deselection before confirming.

**Expected:** The TUI is intuitive — presets are clearly labeled with descriptions, selection works smoothly, and cancelling exits gracefully without errors.

**Result:** PASS

---

## P03-T02: Preset Apply and Review Generated Config

**Scenario:** In a test directory, run `claude-preset apply nextjs`. Then review the generated files: `.claude/settings.json` (should have npm/npx permissions and telemetry env), `.mcp.json` (should have next-devtools server entry), and `CLAUDE.md` (should have an `@.claude/presets/nextjs.md` import line). Open `.claude/presets/nextjs.md` and read the guidance content.

**Expected:** The generated configuration files are well-structured, the CLAUDE.md guidance for Next.js App Router is practical and accurate (covers Server Components, Route Handlers, Server Actions, etc.), and the overall preset looks useful for a real Next.js project.

**Result:** PASS

---

## P03-T03: Container Build with claude-preset

**Scenario:** Build the container after the install.sh fix (added `cp -r "$SCRIPT_DIR/cli" "$devcontainer_dir/"` to `cmd_template()`). The container should build successfully with claude-preset available on PATH via npm link.

**Expected:** Container builds successfully with claude-preset CLI installed and available on PATH.

**Result:** PASS (after fix: `install.sh` was missing `cp -r "$SCRIPT_DIR/cli" "$devcontainer_dir/"` in `cmd_template()`)

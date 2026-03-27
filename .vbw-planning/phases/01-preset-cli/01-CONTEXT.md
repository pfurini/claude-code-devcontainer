# Phase 1: Preset CLI — Context

Gathered: 2026-03-27
Calibration: architect

## Phase Boundary
Implement a Node.js CLI tool (`claude-preset`) that runs inside the devcontainer, allowing users to configure Claude Code with technology-specific presets. Ships with NextJS and Convex presets for v1.

## Decisions

### Preset Definition Format
- Node.js CLI project (not bash), lives in `cli/` subdirectory with its own package.json
- Presets defined as JSON files in `cli/presets/` directory
- Dockerfile copies `cli/` into the container and runs `npm install` + `npm link` to make `claude-preset` globally available
- Technology-specific presets: NextJS, Convex, Postgres, Expo (v1 ships NextJS + Convex only)

### Application Semantics
- Deep merge (additive): preset config merges into existing settings, preserving user customizations
- Stackable presets with last-wins on conflicts: `claude-preset apply nextjs convex` applies sequentially
- Tracked state (`.preset-state.json` or similar): CLI remembers applied presets, supports per-preset removal via `claude-preset remove <name>`

### CLI Integration Model
- Command name: `claude-preset`
- Dual interaction model: bare `claude-preset` launches interactive TUI (inquirer-style), `claude-preset apply <name>` for direct CLI usage
- Subcommands: `apply`, `remove`, `list`, `reset` + interactive mode
- On-demand only: no auto-apply during container creation. User runs it manually after container is up.

### Configuration Surface
- Full config surface per preset:
  - Settings (settings.json)
  - Permissions (allow/deny rules)
  - MCP servers
  - Skills (auto-installed via `pnpm dlx skills install`)
  - Plugins
  - Commands
  - Subagents
  - CLAUDE.md sections via separate include files at `.claude/presets/<name>.md`, referenced with `@.claude/presets/<name>.md` in the project's CLAUDE.md (created if not existing)
- Auto-install on apply: preset runs installation commands (skill install, plugin setup, MCP server registration) during `claude-preset apply`

### Initial Preset List (v1)
- NextJS: App Router conventions, settings, relevant skills/MCP servers
- Convex: BaaS integration, Convex-specific skills/MCP servers, CLAUDE.md guidance

### Open (Claude's discretion)
- Exact npm packages for CLI framework (commander/yargs + inquirer/prompts)
- JSON schema structure for preset definition files
- Error handling strategy for failed auto-installations
- State file location (`.claude/.preset-state.json` or similar)

## Deferred Ideas
- Additional presets: Postgres, Expo, general-dev, minimal/security-audit
- Optional auto-apply via CLAUDE_PRESET env var during container creation
- Preset sharing/publishing mechanism
- Preset composition (named combos like "fullstack = nextjs + postgres")

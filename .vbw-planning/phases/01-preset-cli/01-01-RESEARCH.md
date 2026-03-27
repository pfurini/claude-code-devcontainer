---
phase: "01"
title: "Preset CLI — Integration Research"
type: research
confidence: high
date: 2026-03-27
---

## Findings

### 1. Codebase Integration Points

#### Dockerfile — Tool Installation Pattern

The Dockerfile follows a layered installation pattern. All tools installed as the `vscode` user, after `USER vscode` at line 93. The key patterns for adding the `cli/` directory are:

- Node 24 is installed via fnm at `/home/vscode/.fnm`. It is accessed by first running `eval "$(fnm env)"` before any `node`/`npm` call in RUN steps.
- Global npm packages are linked into fnm's node bin directory.
- The current install sequence for user-space tools ends at the Oh My Zsh block (lines 131–148). A `COPY --chown=vscode:vscode cli/ /opt/claude-preset/` followed by `RUN export PATH="$FNM_DIR:$PATH" && eval "$(fnm env)" && cd /opt/claude-preset && npm install && npm link` would slot cleanly after the Homebrew line (129) and before Oh My Zsh.
- Existing pattern for copying files: `COPY --chown=vscode:vscode post_install.py /opt/post_install.py` (line 150). The `cli/` directory should follow the same pattern.

**Critical**: every `RUN` step that needs node must re-initialize fnm with `export PATH="$FNM_DIR:$PATH" && eval "$(fnm env)"` because the env reset between layers. The `ENV FNM_DIR="/home/vscode/.fnm"` is already set, so just `PATH` export + eval suffices.

#### post_install.py — Claude Code Settings

`setup_claude_settings()` (lines 76–97) reads `~/.claude/settings.json`, merges a `permissions.defaultMode = "bypassPermissions"` key, and writes it back. The merge is additive: it uses `json.loads` → dict update → `json.dumps`. This is the exact same approach `claude-preset` needs for settings merging.

Key facts:
- Settings path: `~/.claude/settings.json` (confirmed by `Path.home() / ".claude" / "settings.json"`)
- The file is created by `post_install.py` during `postCreateCommand`, so it will always exist when `claude-preset` runs
- The `permissions` key is a dict; `defaultMode` is already set to `bypassPermissions`
- The file lives on a Docker volume (`devc-*-config-*`) mounted at `/home/vscode/.claude`

#### Existing settings.json Structure (in-container)

After `post_install.py` runs, the container's `~/.claude/settings.json` contains at minimum:

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

The project-level `.claude/settings.json` (in the repo, mounted read-only into the devcontainer at `/workspace/.devcontainer`) contains:

```json
{
  "permissions": {
    "deny": [
      "Read(.devcontainer/**)"
    ]
  }
}
```

**Important**: The `claude-preset` tool should write to the workspace project's `.claude/settings.json` (i.e., `/workspace/.claude/settings.json`) for preset-driven permissions, not to `~/.claude/settings.json`. This keeps preset config project-scoped and consistent with Claude Code's scope model. The preset state file should live at `/workspace/.claude/.preset-state.json`.

#### devcontainer.json — Volume and Mount Architecture

Relevant mounts for `claude-preset`:
- `~/.claude` is a **named volume** (`devc-*-config-*`) — survives container rebuilds, is NOT in the workspace git repo
- `/workspace` is a bind mount of the host project directory
- `/workspace/.devcontainer` is a read-only bind mount

This means:
- `~/.claude/settings.json` = user-scoped settings, persists across sessions, not in git
- `/workspace/.claude/settings.json` = project-scoped settings, in git
- `/workspace/.mcp.json` = project-scoped MCP servers, in git
- Preset state file should live in `/workspace/.claude/.preset-state.json` (project-level, gitignored by Claude Code automatically for `.local` files, but `.preset-state.json` is a custom name — it should be added to `.gitignore`)

---

### 2. Claude Code Configuration Surface

#### settings.json — Complete Top-Level Schema

From the official docs (`https://json.schemastore.org/claude-code-settings.json`), the relevant fields for preset management:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run *)", "Read(~/.zshrc)"],
    "ask": ["Bash(git push *)"],
    "deny": ["WebFetch", "Read(./.env)"],
    "additionalDirectories": ["../docs/"],
    "defaultMode": "acceptEdits",
    "disableBypassPermissionsMode": "disable"
  },
  "env": {
    "FOO": "bar"
  },
  "hooks": {},
  "model": "claude-sonnet-4-6",
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["memory", "github"],
  "companyAnnouncements": ["..."],
  "effortLevel": "high",
  "language": "japanese"
}
```

Key settings for presets:
- `permissions.allow` / `permissions.deny` / `permissions.ask` — arrays, merged additively across scopes
- `env` — object, project env vars injected into every session
- `enableAllProjectMcpServers: true` — auto-approve `.mcp.json` servers
- `enabledMcpjsonServers` — whitelist specific `.mcp.json` servers by name

#### Scope Rules for Settings

| Scope | Location | Shared? |
|-------|----------|---------|
| User | `~/.claude/settings.json` | No (per-user) |
| Project | `.claude/settings.json` in repo | Yes (git) |
| Local | `.claude/settings.local.json` | No (gitignored) |

Permission arrays are **concatenated** across scopes (not overridden). `claude-preset apply` should write to the **project** scope (`.claude/settings.json` in the workspace root) for team-shareable presets.

#### MCP Server Configuration

MCP servers for **project scope** go in `.mcp.json` at the project root (i.e., `/workspace/.mcp.json`).

Full format for `.mcp.json`:

```json
{
  "mcpServers": {
    "convex": {
      "type": "stdio",
      "command": "npx",
      "args": ["convex", "mcp", "start"]
    },
    "next-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    },
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp",
      "headers": {
        "Authorization": "Bearer ${NOTION_TOKEN}"
      }
    }
  }
}
```

**Transport types**: `"stdio"` (local process), `"http"` (remote, recommended), `"sse"` (deprecated).
**Env var expansion**: `.mcp.json` supports `${VAR}` and `${VAR:-default}` syntax in strings.

Adding via CLI (equivalent to what preset tool does by writing JSON directly):
```bash
# stdio
claude mcp add --transport stdio --scope project convex -- npx convex mcp start

# http
claude mcp add --transport http --scope project notion https://mcp.notion.com/mcp

# with env var
claude mcp add --transport stdio --scope project --env KEY=value myserver -- npx pkg
```

**Important**: `claude-preset` should write `.mcp.json` directly (not call `claude mcp add`) to avoid requiring Claude Code to be running during preset application.

#### Real Preset MCP Entries for v1

**Convex** (from official docs at `https://docs.convex.dev/ai/convex-mcp-server`):
```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["convex", "mcp", "start"]
}
```
Capabilities: introspect tables/functions, call functions, read/write data.

**Next.js DevTools** (from `https://github.com/vercel/next-devtools-mcp`):
```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "next-devtools-mcp@latest"]
}
```

#### Skills Installation

Skills use the `pnpm dlx skills` CLI (the `skills` npm package):

```bash
# Install a skill from a GitHub repo
pnpm dlx skills add owner/repo --skill skill-name -y

# Install multiple skills
pnpm dlx skills add vercel-labs/agent-skills --skill frontend-design --skill skill-creator -y

# List available skills in a repo
pnpm dlx skills add owner/repo --list
```

Skills are placed in `~/.claude/skills/<skill-name>/SKILL.md` (user-scoped) or `.claude/skills/<skill-name>/SKILL.md` (project-scoped).

A `SKILL.md` file structure:
```markdown
---
name: my-skill
description: What it does and when Claude should use it
disable-model-invocation: false
allowed-tools: Read, Grep
---

Skill instructions here...
```

Skills are stored at `~/.claude/skills/` (mounted as a bind mount from `~/.claude/skills` on host, read-only per `devcontainer.json` line 55). This means `claude-preset` cannot write skills to `~/.claude/skills/` from inside the container. Skills must be written to `.claude/skills/` in the workspace instead (project-scoped), or the host bind mount needs to be made writable (not recommended).

**Resolution**: Presets should install skills to `/workspace/.claude/skills/` (project scope). This requires running `pnpm dlx skills add ... --target .claude/skills/` if the CLI supports it, OR manually writing the `SKILL.md` file to the project's `.claude/skills/<name>/SKILL.md`.

#### CLAUDE.md @ Include Syntax

The `@` import syntax in CLAUDE.md:

```markdown
# Main CLAUDE.md
@.claude/presets/nextjs.md
@.claude/presets/convex.md
```

Rules:
- Both relative and absolute paths are supported
- Relative paths resolve relative to the file containing the import (not CWD)
- Imported files are expanded into context at launch
- Recursive imports supported up to 5 hops deep
- Files are loaded at startup alongside the referencing CLAUDE.md

`claude-preset apply` workflow for CLAUDE.md:
1. Write preset-specific guidance to `.claude/presets/<name>.md`
2. Add `@.claude/presets/<name>.md` to the project's `CLAUDE.md` (or create it if missing)
3. On `remove`: delete the preset file and remove the `@` import line from CLAUDE.md

Known issue: The `@~/.claude/file.md` syntax (tilde home expansion) has reported bugs in some Claude Code versions (GitHub issue #8765). Prefer relative paths.

---

### 3. Node.js CLI Patterns

#### CLI Framework Recommendation: Commander + @clack/prompts

**Commander.js** for command parsing:
- The de facto standard for Node.js CLI subcommands
- Handles `apply`, `remove`, `list`, `reset` subcommand pattern cleanly
- Well-maintained, TypeScript types included, minimal dependencies

**@clack/prompts** for interactive TUI:
- Modern alternative to Inquirer.js; ~4KB gzipped vs Inquirer's larger footprint
- Ships with beautiful opinionated styling out of the box (no chalk/ANSI needed)
- Named exports, no class instantiation — just `select()`, `multiselect()`, `confirm()`, `text()`
- No peer dependencies
- Ideal for the "bare `claude-preset` → interactive preset picker" UX
- Downside: less community surface than Inquirer, but sufficient for this use case

Alternative considered: **Inquirer.js v9+** — now ESM-only, fractured ecosystem, heavier. Not recommended for a new project.

#### npm link Global Binary Pattern

`package.json` structure for global CLI:
```json
{
  "name": "claude-preset",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "claude-preset": "./src/index.js"
  },
  "scripts": {
    "install-global": "npm link"
  }
}
```

The `src/index.js` entry must start with `#!/usr/bin/env node`.

In the Dockerfile:
```dockerfile
COPY --chown=vscode:vscode cli/ /opt/claude-preset/
RUN export PATH="$FNM_DIR:$PATH" && \
  eval "$(fnm env)" && \
  cd /opt/claude-preset && \
  npm install && \
  npm link
```

`npm link` creates a symlink in the global bin directory (managed by fnm), making `claude-preset` available on `$PATH`.

#### Deep Merge Library: deepmerge

For merging preset config into existing settings.json:

**`deepmerge`** (v4.3.1, 12k+ dependents):
- Arrays are **concatenated by default** — exactly right for `permissions.allow`/`deny` arrays
- Objects are recursively merged — right for `env`, nested settings
- Configurable array merge strategy if needed
- No runtime dependencies, tiny size

```js
import deepmerge from 'deepmerge';

const merged = deepmerge(existingSettings, presetSettings);
// permissions.allow arrays are concatenated, not replaced
// env objects are deep-merged
```

For remove semantics (de-duplication and removal from arrays), deepmerge alone is insufficient — custom array subtraction logic is needed.

Alternative: **`@fastify/deepmerge`** — 30x faster benchmark but same API. Overkill for config files.

---

### 4. Preset JSON Schema Design

#### Recommended Schema

```json
{
  "$schema": "./preset.schema.json",
  "name": "nextjs",
  "version": "1.0.0",
  "description": "Next.js App Router preset for Claude Code",
  "settings": {
    "permissions": {
      "allow": [
        "Bash(npm run *)",
        "Bash(npx *)"
      ],
      "deny": []
    },
    "env": {
      "NEXT_TELEMETRY_DISABLED": "1"
    }
  },
  "mcpServers": {
    "next-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  },
  "skills": [
    {
      "repo": "vercel-labs/agent-skills",
      "skill": "frontend-design"
    }
  ],
  "claudeMd": {
    "file": "nextjs.md",
    "content": "## Next.js Conventions\n\nAlways use App Router..."
  }
}
```

#### Field-by-Field Rationale

| Field | Type | Semantics |
|-------|------|-----------|
| `name` | string | Canonical preset identifier (slug), used as key in state file |
| `version` | string | Semver, for future compatibility checks |
| `description` | string | Shown in `claude-preset list` |
| `settings` | object | Subset of Claude Code `settings.json` — deep-merged into project `.claude/settings.json` |
| `settings.permissions.allow` | string[] | Appended to existing allow array |
| `settings.permissions.deny` | string[] | Appended to existing deny array |
| `settings.env` | object | Merged into existing env object |
| `mcpServers` | object | Written into project `.mcp.json` under `mcpServers` key |
| `skills` | array | Each entry: `{ repo, skill, target? }` — installed via `pnpm dlx skills add` |
| `claudeMd.file` | string | Filename for `.claude/presets/<file>` |
| `claudeMd.content` | string | Markdown content written to that file |

#### Additive vs Replace Semantics

- `settings` fields: **deep merge additive** (arrays concatenated, objects merged)
- `mcpServers` entries: **additive by key** (new keys added, existing keys updated)
- `skills`: **idempotent** (check if skill directory exists before installing)
- `claudeMd`: **write and add `@` import** (idempotent — skip if import already present)

#### State File: `.claude/.preset-state.json`

```json
{
  "version": 1,
  "applied": [
    {
      "name": "nextjs",
      "appliedAt": "2026-03-27T10:00:00Z",
      "presetVersion": "1.0.0"
    },
    {
      "name": "convex",
      "appliedAt": "2026-03-27T10:01:00Z",
      "presetVersion": "1.0.0"
    }
  ]
}
```

Location: `/workspace/.claude/.preset-state.json`. Should be gitignored (it is machine-local state). Add to `.gitignore` during first `apply`.

---

## Relevant Patterns

### Post-install Pattern (from post_install.py)

The `setup_claude_settings()` function establishes the merge-and-write pattern used throughout:
1. Load existing JSON (or start with `{}`)
2. Merge new keys
3. Write back with `json.dumps(settings, indent=2)`

`claude-preset` follows identical logic in JavaScript:
```js
const existing = JSON.parse(await fs.readFile(settingsPath, 'utf8').catch(() => '{}'));
const merged = deepmerge(existing, presetSettings);
await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n');
```

### Dockerfile COPY + npm install + npm link Pattern

No existing example in the repo (claude is the first Node tool). However, the fnm setup (lines 112–117) establishes the `eval "$(fnm env)"` pattern. Node-requiring RUN steps must always re-activate fnm.

### Settings Scope Decision

`claude-preset apply` should write to **project scope** (`.claude/settings.json` in workspace), not user scope (`~/.claude/settings.json`). This is consistent with:
- The team-sharing model — teammates cloning the repo benefit from preset config
- The `devcontainer.json` architecture — workspace is the primary working directory
- The existing `.claude/settings.json` already being used in this repo for the `Read(.devcontainer/**)` deny rule

---

## Risks

1. **fnm path initialization in Dockerfile RUN** — Each `RUN` layer loses the shell env. The `npm link` step must re-initialize fnm. If forgotten, the `npm` binary won't be found.

2. **Skills mount is read-only** — `~/.claude/skills` is mounted `readonly` from the host. Writing skills to `~/.claude/skills/` from inside the container will fail with permission errors. Preset skills must go to `.claude/skills/` (project scope) instead.

3. **Settings file timing** — `claude-preset` is run manually after container creation. `post_install.py` has already run, so `~/.claude/settings.json` exists. However, `.claude/settings.json` in the workspace may or may not exist (depends on whether the project has one). The tool must handle both cases.

4. **CLAUDE.md @ import path bugs** — Multiple GitHub issues (#8765, #5231, #1041) report inconsistent behavior with the `@` import syntax, especially for home-directory paths. Using only project-relative paths (e.g., `@.claude/presets/nextjs.md`) avoids these issues.

5. **Array deduplication on re-apply** — If `claude-preset apply nextjs` is run twice, naive deepmerge will duplicate entries in `permissions.allow`. The state file check prevents double-application, but the CLI should also deduplicate arrays when merging.

6. **Remove semantics complexity** — Removing a preset requires knowing exactly which entries were added by it. The state file does not currently track per-field diff. A simple approach: store the preset's `settings` block in the state file entry, then subtract on removal (filter array entries that match the stored values).

7. **`.mcp.json` approval prompt** — Claude Code prompts for approval before using project-scoped MCP servers from `.mcp.json`. Setting `enableAllProjectMcpServers: true` in `~/.claude/settings.json` (user scope) or in `.claude/settings.json` (project scope) suppresses this. The preset tool should add this setting automatically if `mcpServers` are being registered.

8. **npm/pnpm in container** — `devcontainer.json` sets `NPM_CONFIG_MINIMUM_RELEASE_AGE=1440` (1-day min age for npm packages). This shouldn't affect `pnpm dlx skills add` but worth noting for any `npm install` calls during apply.

---

## Recommendations

### R1: CLI Project Structure

```
cli/
  package.json          # name: "claude-preset", bin.claude-preset: "./src/index.js"
  src/
    index.js            # Entry, commander setup, interactive mode
    commands/
      apply.js          # apply subcommand
      remove.js         # remove subcommand
      list.js           # list subcommand
      reset.js          # reset subcommand
    lib/
      settings.js       # Read/write .claude/settings.json
      mcp.js            # Read/write .mcp.json
      skills.js         # Install skills via pnpm dlx
      claudeMd.js       # Write preset files + manage @ imports
      state.js          # Read/write .preset-state.json
      merge.js          # deepmerge + array dedup helpers
    presets/
      nextjs.json       # NextJS preset definition
      convex.json       # Convex preset definition
```

### R2: Dockerfile Integration Point

Insert after line 129 (brew install line), before Oh My Zsh (line 131):

```dockerfile
# Install claude-preset CLI
COPY --chown=vscode:vscode cli/ /opt/claude-preset/
RUN export PATH="$FNM_DIR:$PATH" && \
  eval "$(fnm env)" && \
  cd /opt/claude-preset && \
  npm install --omit=dev && \
  npm link
```

### R3: Settings Write Strategy

- Preset settings → `/workspace/.claude/settings.json` (project scope)
- MCP servers → `/workspace/.mcp.json` (project scope)
- CLAUDE.md preset files → `/workspace/.claude/presets/<name>.md`
- Skills → `/workspace/.claude/skills/<name>/` (project scope)
- State → `/workspace/.claude/.preset-state.json`
- Add to `/workspace/.gitignore` on first apply: `.claude/.preset-state.json`

After writing MCP servers, also set `enableAllProjectMcpServers: true` in project settings to suppress approval prompts.

### R4: CLI Framework Choices

- **Commander.js** for command/subcommand parsing (`claude-preset apply <names...>`)
- **@clack/prompts** for the interactive TUI (bare `claude-preset` → multi-select checkboxes)
- **deepmerge** (v4.x) for settings merging
- No other runtime dependencies needed

Package.json deps:
```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "@clack/prompts": "^0.9.0",
    "deepmerge": "^4.3.1"
  }
}
```

### R5: Preset JSON Schema for v1

Both `nextjs.json` and `convex.json` should use the schema defined above. Key concrete entries:

**nextjs.json** MCP server entry:
```json
"mcpServers": {
  "next-devtools": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "next-devtools-mcp@latest"]
  }
}
```

**convex.json** MCP server entry:
```json
"mcpServers": {
  "convex": {
    "type": "stdio",
    "command": "npx",
    "args": ["convex", "mcp", "start"]
  }
}
```

### R6: Array Deduplication Strategy

Use a custom deepmerge array merge function that deduplicates:

```js
import deepmerge from 'deepmerge';

const arrayUnion = (dest, src) => {
  const set = new Set([...dest, ...src]);
  return [...set];
};

const merge = (a, b) => deepmerge(a, b, { arrayMerge: arrayUnion });
```

For removal, store the original preset `settings` block in state and filter arrays:

```js
// Remove entries that were added by this preset
for (const item of storedPreset.settings.permissions.allow) {
  current.permissions.allow = current.permissions.allow.filter(x => x !== item);
}
```

### R7: Skills Target Path

Since `~/.claude/skills` is read-only in the container, skills should be written to `.claude/skills/` in the project workspace. The `pnpm dlx skills add` command target flag should be investigated; if unavailable, directly write the SKILL.md file:

```js
const skillDir = path.join(workspaceRoot, '.claude', 'skills', skillName);
await fs.mkdir(skillDir, { recursive: true });
await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
```

For `skills` preset entries that reference a GitHub repo, use `pnpm dlx skills add owner/repo --skill name` which should handle the file placement automatically.

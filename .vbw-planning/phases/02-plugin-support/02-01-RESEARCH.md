---
phase: "02"
title: "Plugin Support — Integration Research"
type: research
confidence: high
date: 2026-03-27
---

## Existing Codebase (current preset CLI architecture, schema, state management)

### CLI Architecture Overview

The preset CLI (`cli/`) is a Node.js ESM project structured as follows:

```
cli/
  src/
    index.js              # Entry: Commander subcommands + bare interactive TUI
    commands/
      apply.js            # Loads preset JSON, calls lib functions per field
      remove.js           # Reads stored snapshot, reverses each lib function
      list.js             # Lists presets
      reset.js            # Removes all applied presets
    lib/
      settings.js         # Read/write .claude/settings.json (deepmerge + subtractConfig)
      mcp.js              # Read/write .mcp.json (add/remove keys)
      skills.js           # pnpm dlx skills add / rm -rf skill dir
      claudeMd.js         # Write .claude/presets/<name>.md + manage @ imports in CLAUDE.md
      state.js            # Read/write .claude/.preset-state.json
      merge.js            # deepmerge with arrayUnion + subtractConfig
  presets/
    nextjs.json
    convex.json
```

### Apply/Remove Pattern

`apply.js` orchestrates preset application in a fixed sequence:
1. Load preset JSON from `presets/<name>.json`
2. For each present field: call the relevant `applyPreset*` lib function
3. `addApplied(state, name, version, preset)` — stores the **entire preset JSON** as the snapshot
4. `saveState()` — persists to `.claude/.preset-state.json`

`remove.js` reverses it:
1. `removeApplied(state, name)` — pops the entry, returns `entry.snapshot`
2. For each present field in `snapshot`: call the relevant `removePreset*` lib function
3. `saveState()` on success; re-pushes entry on failure (error recovery pattern)

**Key pattern for new feature**: Adding plugin support requires:
- One new `applyPresetPlugins()` function in a new `cli/src/lib/plugins.js`
- One new `removePresetPlugins()` function in the same file
- Two new conditional blocks in `apply.js` and `remove.js` matching the existing `if (preset.plugins)` guard style
- The `plugins` array is already stored as part of `preset` (the snapshot), so state tracking is automatic

### Current Preset Schema

Both `nextjs.json` and `convex.json` follow this structure (neither has `plugins` yet):

```json
{
  "name": "nextjs",
  "version": "1.0.0",
  "description": "...",
  "settings": { "permissions": { "allow": [...] }, "env": {} },
  "mcpServers": { "server-name": { "type": "stdio", "command": "...", "args": [...] } },
  "skills": [],
  "claudeMd": { "file": "nextjs.md", "content": "..." }
}
```

Both have `"skills": []` (empty arrays). Neither has a `plugins` field.

### Skills Lib Pattern (Direct Model for Plugin Lib)

`skills.js` is the closest analog and establishes the pattern to follow:

**Apply**: iterate preset items, check existence (idempotency), call `spawnSync` with the external CLI, handle errors gracefully (continue on failure, log error).

**Remove**: iterate stored snapshot items, delete the artifact on disk (`rm -rf`), swallow ENOENT.

**Idempotency check**: For skills, checks `path.join(workspaceRoot, '.claude', 'skills', skillName, 'SKILL.md')` for existence. For plugins, the equivalent check is whether the plugin appears in `.claude/settings.json`'s `enabledPlugins` map.

---

## Plugin CLI Interface (how claude plugin install/remove works, available commands)

### Core CLI Commands

Claude Code (v1.0.33+) provides a `claude plugin` CLI for non-interactive management:

```bash
# Install (defaults to user scope)
claude plugin install <plugin>@<marketplace> [--scope user|project|local]

# Examples:
claude plugin install formatter@my-marketplace
claude plugin install formatter@my-marketplace --scope project
claude plugin install formatter@my-marketplace --scope local

# Uninstall (aliases: remove, rm)
claude plugin uninstall <plugin>@<marketplace> [--scope user|project|local] [--keep-data]

# Enable / Disable (without uninstalling)
claude plugin enable <plugin>@<marketplace> [--scope ...]
claude plugin disable <plugin>@<marketplace> [--scope ...]

# Update to latest version
claude plugin update <plugin>@<marketplace> [--scope ...]
```

**Key insight**: The `--scope project` flag writes to `.claude/settings.json` under `enabledPlugins`. This is the file the preset CLI already manages. So `claude plugin install --scope project` and directly writing `enabledPlugins` to `.claude/settings.json` are equivalent.

### Plugin Identification Format

Plugins are identified as `plugin-name@marketplace-name`. The `@marketplace-name` part corresponds to the marketplace's key in `extraKnownMarketplaces` (or `claude-plugins-official` for the official Anthropic marketplace).

### Plugin Installation Mechanics

When `claude plugin install formatter@my-marketplace --scope project` is run:
1. It looks up the marketplace in the known marketplaces list
2. Downloads/caches the plugin to `~/.claude/plugins/cache/`
3. Writes `"formatter@my-marketplace": true` to `enabledPlugins` in the appropriate `settings.json`

When running `--scope project`, this modifies `.claude/settings.json` in the project root — the same file `applyPresetSettings` already reads and writes.

### Alternative: Direct settings.json Write (Recommended)

Rather than shelling out to `claude plugin install`, the preset CLI can write directly to `.claude/settings.json`. This is consistent with how MCP servers are managed (writing `.mcp.json` directly rather than calling `claude mcp add`).

The `settings.json` plugin fields:

```json
{
  "enabledPlugins": {
    "plugin-name@marketplace-name": true
  },
  "extraKnownMarketplaces": {
    "marketplace-name": {
      "source": {
        "source": "github",
        "repo": "owner/repo"
      }
    }
  }
}
```

**Critical**: Installing a plugin from a non-official marketplace requires the marketplace to be registered first. The `extraKnownMarketplaces` field in `settings.json` handles this. When a team member trusts the repository folder, Claude Code prompts them to add the marketplace and install its plugins.

### Marketplace Source Types

```json
{
  "extraKnownMarketplaces": {
    "my-marketplace": {
      "source": {
        "source": "github",
        "repo": "owner/repo"
      }
    },
    "git-marketplace": {
      "source": {
        "source": "git",
        "url": "https://gitlab.com/org/plugins.git"
      }
    },
    "inline-marketplace": {
      "source": {
        "source": "settings",
        "name": "...",
        "plugins": [...]
      }
    }
  }
}
```

Source type `"github"` requires `repo` field. Source type `"git"` requires `url`. The `"settings"` type declares plugins inline (no external repo needed).

### Official Marketplace

`claude-plugins-official` is automatically available — no `extraKnownMarketplaces` entry needed. Relevant official plugins for the v1 presets:

- `typescript-lsp@claude-plugins-official` — TypeScript/JavaScript LSP (Next.js)
- `commit-commands@claude-plugins-official` — git workflow commands
- `pr-review-toolkit@claude-plugins-official` — PR review agents
- No Convex-specific official plugin found (Convex uses an MCP server instead)

### Plugin Scope in settings.json

| Scope   | File written                       | Shared?          |
|---------|------------------------------------|------------------|
| `user`  | `~/.claude/settings.json`          | No               |
| `project`| `.claude/settings.json`           | Yes (git commit) |
| `local` | `.claude/settings.local.json`      | No (gitignored)  |

The preset CLI should use **project scope** (`.claude/settings.json`) for the same reason settings/MCP are project-scoped: team sharing.

---

## Schema Extension Points (where to add plugins field in preset JSON)

### Proposed `plugins` Field

Add a top-level `plugins` array to the preset JSON schema, parallel to `skills`:

```json
{
  "name": "nextjs",
  "version": "1.0.0",
  "description": "...",
  "settings": { ... },
  "mcpServers": { ... },
  "skills": [],
  "plugins": [
    {
      "name": "typescript-lsp",
      "marketplace": "claude-plugins-official",
      "scope": "project"
    }
  ],
  "claudeMd": { ... }
}
```

### Plugin Entry Schema

Each entry in the `plugins` array:

| Field        | Type     | Required | Description |
|--------------|----------|----------|-------------|
| `name`       | string   | Yes      | Plugin name (the part before `@`) |
| `marketplace`| string   | Yes      | Marketplace key (e.g. `claude-plugins-official`, or a key in `extraKnownMarketplaces`) |
| `scope`      | string   | No       | `"project"` (default), `"user"`, or `"local"` |

The full plugin ID used in `enabledPlugins` is `${name}@${marketplace}`.

### Where `extraKnownMarketplaces` Entries Come From

If `marketplace` is anything other than `claude-plugins-official`, the preset must also declare how to locate that marketplace. Two options:

**Option A** — Inline in the plugin entry (simpler for preset authors):
```json
{
  "name": "my-plugin",
  "marketplace": "acme-tools",
  "marketplaceSource": {
    "source": "github",
    "repo": "acme-corp/claude-plugins"
  }
}
```

**Option B** — Top-level `marketplaces` field in preset JSON (cleaner for multi-plugin presets):
```json
{
  "plugins": [
    { "name": "plugin-a", "marketplace": "acme-tools" },
    { "name": "plugin-b", "marketplace": "acme-tools" }
  ],
  "marketplaces": {
    "acme-tools": {
      "source": { "source": "github", "repo": "acme-corp/claude-plugins" }
    }
  }
}
```

**Recommendation**: Option B (top-level `marketplaces` field) is cleaner and avoids redundant `marketplaceSource` on each plugin entry when multiple plugins share the same marketplace. The official marketplace `claude-plugins-official` needs no entry (it is always available).

### Updated Full Schema for v1 Presets

```json
{
  "name": "nextjs",
  "version": "2.0.0",
  "description": "Next.js App Router preset for Claude Code",
  "settings": { ... },
  "mcpServers": { ... },
  "skills": [],
  "plugins": [
    {
      "name": "typescript-lsp",
      "marketplace": "claude-plugins-official",
      "scope": "project"
    }
  ],
  "marketplaces": {},
  "claudeMd": { ... }
}
```

---

## State Tracking (how .preset-state.json works, what needs extending for plugins)

### Current State File Structure

`.claude/.preset-state.json`:

```json
{
  "version": 1,
  "applied": [
    {
      "name": "nextjs",
      "appliedAt": "2026-03-27T10:00:00Z",
      "presetVersion": "1.0.0",
      "snapshot": {
        "name": "nextjs",
        "version": "1.0.0",
        "description": "...",
        "settings": { ... },
        "mcpServers": { ... },
        "skills": [],
        "claudeMd": { ... }
      }
    }
  ]
}
```

The **entire preset JSON** is stored as `snapshot`. This is the source of truth for `removeCommand` — it iterates `snapshot` fields, not the current preset file (which may have changed since apply time).

### No State Extension Required

Because the full preset JSON is already stored as `snapshot`, adding a `plugins` field to the preset JSON automatically makes it available in the snapshot at remove time. The `addApplied(state, name, version, preset)` call in `apply.js` stores `preset` (the parsed JSON object), so any new top-level fields in the preset are preserved automatically.

The only code change needed is:
1. In `apply.js`: add a conditional block that calls `applyPresetPlugins(workspaceRoot, preset.plugins, preset.marketplaces)` when `preset.plugins && preset.plugins.length > 0`
2. In `remove.js`: add a conditional block that calls `removePresetPlugins(workspaceRoot, snapshot.plugins, snapshot.marketplaces)` when `snapshot.plugins && snapshot.plugins.length > 0`

No changes to `state.js` are required.

### Plugin State in settings.json

The `enabledPlugins` map in `.claude/settings.json` is the persistent plugin state maintained by Claude Code itself. The preset CLI:
- On apply: merges `enabledPlugins` entries into `.claude/settings.json` (and optionally `extraKnownMarketplaces`)
- On remove: deletes the specific `enabledPlugins` keys that were added by this preset

The existing `subtractConfig()` in `merge.js` handles object key deletion when scalar values match (`curVal === remVal` check), but `enabledPlugins` values are booleans — `subtractConfig` will correctly delete them when the snapshot matches. However, the safest approach is to explicitly delete keys by name rather than relying on deep subtraction for the `enabledPlugins` object.

---

## Implementation Patterns (recommended approach based on existing code patterns)

### New File: `cli/src/lib/plugins.js`

Mirrors the structure of `skills.js`:

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { mergeConfig } from './merge.js';
import { readSettings, writeSettings } from './settings.js';

/**
 * Apply preset plugins by writing enabledPlugins + extraKnownMarketplaces
 * to .claude/settings.json.
 * @param {string} workspaceRoot
 * @param {{ name: string, marketplace: string, scope?: string }[]} presetPlugins
 * @param {object} presetMarketplaces  key -> { source: {...} }
 */
export async function applyPresetPlugins(workspaceRoot, presetPlugins, presetMarketplaces = {}) {
  const settings = await readSettings(workspaceRoot);

  // Merge extraKnownMarketplaces
  if (Object.keys(presetMarketplaces).length > 0) {
    settings.extraKnownMarketplaces = {
      ...settings.extraKnownMarketplaces,
      ...presetMarketplaces,
    };
  }

  // Enable plugins
  settings.enabledPlugins = settings.enabledPlugins ?? {};
  for (const { name, marketplace } of presetPlugins) {
    const pluginId = `${name}@${marketplace}`;
    settings.enabledPlugins[pluginId] = true;
  }

  await writeSettings(workspaceRoot, settings);
}

/**
 * Remove preset plugins by deleting their enabledPlugins entries
 * and any extraKnownMarketplaces that are no longer needed.
 * @param {string} workspaceRoot
 * @param {{ name: string, marketplace: string }[]} presetPluginsSnapshot
 * @param {object} presetMarketplacesSnapshot
 */
export async function removePresetPlugins(workspaceRoot, presetPluginsSnapshot, presetMarketplacesSnapshot = {}) {
  const settings = await readSettings(workspaceRoot);

  // Remove plugin entries
  if (settings.enabledPlugins) {
    for (const { name, marketplace } of presetPluginsSnapshot) {
      const pluginId = `${name}@${marketplace}`;
      delete settings.enabledPlugins[pluginId];
    }
    if (Object.keys(settings.enabledPlugins).length === 0) {
      delete settings.enabledPlugins;
    }
  }

  // Remove marketplace entries added by this preset
  if (settings.extraKnownMarketplaces) {
    for (const key of Object.keys(presetMarketplacesSnapshot)) {
      delete settings.extraKnownMarketplaces[key];
    }
    if (Object.keys(settings.extraKnownMarketplaces).length === 0) {
      delete settings.extraKnownMarketplaces;
    }
  }

  await writeSettings(workspaceRoot, settings);
}
```

### Changes to `apply.js`

Add after the skills block (lines 66–68):

```js
if (preset.plugins && preset.plugins.length > 0) {
  await applyPresetPlugins(workspaceRoot, preset.plugins, preset.marketplaces ?? {});
}
```

Import: `import { applyPresetPlugins } from '../lib/plugins.js';`

### Changes to `remove.js`

Add after the skills block (lines 36–38):

```js
if (snapshot.plugins && snapshot.plugins.length > 0) {
  await removePresetPlugins(workspaceRoot, snapshot.plugins, snapshot.marketplaces ?? {});
}
```

Import: `import { removePresetPlugins } from '../lib/plugins.js';`

### Preset JSON Updates for v1

**`nextjs.json`** — add TypeScript LSP plugin (most relevant for Next.js/TS projects):

```json
"plugins": [
  {
    "name": "typescript-lsp",
    "marketplace": "claude-plugins-official",
    "scope": "project"
  }
],
"marketplaces": {}
```

**`convex.json`** — no official Convex-specific plugin found. Convex coverage is already provided via the MCP server. Leave `plugins: []` unless research finds a specific Convex plugin in the official marketplace.

### Shell-Out vs Direct Write

The existing code pattern (writing JSON directly rather than calling CLI tools) is the right choice for plugins too:

- `mcp.js` writes `.mcp.json` directly instead of calling `claude mcp add`
- `settings.js` writes `.claude/settings.json` directly instead of calling `/config`
- **`plugins.js` should write `enabledPlugins` to `.claude/settings.json` directly** instead of calling `claude plugin install`

Reasons:
1. Consistency with existing pattern
2. `claude plugin install` is an interactive REPL slash command, not a reliable scripting interface
3. The actual install (downloading from marketplace into `~/.claude/plugins/cache/`) happens the next time Claude Code starts — writing `enabledPlugins: true` is sufficient to configure which plugins Claude Code will load
4. Avoids requiring Claude Code to be running during preset application

### `enabledPlugins` Merge Behavior

The `enabledPlugins` field in `settings.json` is an **object** (not an array). Two merged preset `enabledPlugins` objects don't conflict — each preset adds its own keys. The existing `mergeConfig()` deep-merge handles this correctly. However, since `applyPresetPlugins` writes directly rather than using deep merge (to avoid boolean-false overriding boolean-true from another preset), the implementation should use explicit object spread:

```js
settings.enabledPlugins = {
  ...settings.enabledPlugins,
  ...newPluginsMap,
};
```

This is additive and does not clobber existing entries from other presets.

---

## Risks and Considerations

### R1: Plugin Install vs Config Write Distinction

Writing `enabledPlugins: true` in `settings.json` tells Claude Code to *load* a plugin — but the actual plugin content (skills, agents, hooks) must be cached in `~/.claude/plugins/cache/` first. That caching happens when Claude Code first starts after seeing the `enabledPlugins` entry (it downloads from the marketplace automatically). So applying a preset with plugins does not instantly make plugin commands available; the user must restart Claude Code afterward.

**Mitigation**: Print a clear message after applying plugins: `"Plugin(s) installed. Restart Claude Code (or run /reload-plugins) to activate them."` This matches the behavior described in the official docs.

### R2: Marketplace Not Registered

If a preset references a non-official marketplace (one not in `extraKnownMarketplaces`) and the user hasn't added it manually, Claude Code will fail to load the plugin silently. The `applyPresetPlugins` function must always write both `enabledPlugins` AND `extraKnownMarketplaces` entries for non-official marketplaces.

**Mitigation**: In `applyPresetPlugins`, always process `presetMarketplaces` before `presetPlugins`. For official marketplace (`claude-plugins-official`), no marketplace entry is needed — guard with `if (marketplace !== 'claude-plugins-official')`.

### R3: Remove Safety — Shared Marketplace Entries

If two presets both reference the same third-party marketplace, removing one should not delete the `extraKnownMarketplaces` entry (because the other preset still needs it).

**Mitigation**: Before deleting a marketplace entry from `extraKnownMarketplaces`, check whether any other installed plugin still references that marketplace. The `state.applied` array provides the data: scan `state.applied` for any other entry whose `snapshot.plugins` array contains a plugin with the same marketplace name. Only delete if no other preset references it.

This requires `removePresetPlugins` to accept the full `state` as a parameter, or implement a post-removal check in `remove.js` before calling `saveState()`. The simpler approach is to pass only the names of marketplaces that are exclusively used by this preset.

Alternatively (simpler, less perfect): never delete `extraKnownMarketplaces` entries on remove. The entry is harmless if left — it just means Claude Code knows about a marketplace even if no plugins from it are enabled. This avoids the cross-preset reference check entirely.

### R4: `enabledPlugins: false` Overwrite Risk

If a user has manually disabled a plugin (`"plugin@marketplace": false`) and a preset sets it back to `true`, the preset silently overrides the user's preference.

**Mitigation**: In `applyPresetPlugins`, only set `enabledPlugins[pluginId] = true` if the key does not already exist or is already `true`. If the key is `false` (user explicitly disabled), skip and log a warning.

```js
if (settings.enabledPlugins[pluginId] !== false) {
  settings.enabledPlugins[pluginId] = true;
}
```

### R5: `subtractConfig` and enabledPlugins on Remove

The existing `removePresetSettings` uses `subtractConfig()` which deletes scalar-matching keys. If the `plugins` logic went through `subtractConfig`, it would work because `{"formatter@x": true}` would be subtracted correctly. However, using explicit key deletion in `removePresetPlugins` (separate from `removePresetSettings`) is cleaner and less surprising.

The `snapshot.settings` in the state file does NOT include `enabledPlugins` or `extraKnownMarketplaces` — those are managed separately by the new `plugins.js` lib. This means `removePresetSettings` will not accidentally try to subtract them. The plugins lib operates on the same `settings.json` file but handles different top-level keys.

### R6: `scope` Field in Plugin Entries

The schema includes an optional `scope` field per plugin. For the preset CLI use case, scope is always `project` (since presets are project-level config). The `scope` field in preset JSON is informational / future-use. The current implementation should ignore it and always write to project scope (`.claude/settings.json`).

If user-scope or local-scope plugin installation is needed in the future, the `scope` field provides the hook point.

### R7: Claude Code Version Requirement

The `claude plugin` CLI and the `enabledPlugins` settings key require Claude Code v1.0.33 or later. Since this is a devcontainer with a pinned Claude Code version in the Dockerfile, this should be fine — but the Dockerfile's Claude Code version must be checked to ensure it meets this requirement.

**Mitigation**: Document in the preset CLI README that plugins require Claude Code v1.0.33+. The `applyPresetPlugins` function does not need to version-check at runtime (the settings key is simply ignored by older versions without crashing).

### R8: No Available Official Plugins for Convex

Research did not find a Convex-specific plugin in the `claude-plugins-official` marketplace. The Convex preset already has a well-functioning MCP server. The `plugins` field should remain an empty array for `convex.json` in v1 unless a plugin is identified.

The `typescript-lsp@claude-plugins-official` plugin is highly relevant for `nextjs.json` since Next.js projects are TypeScript-first. This should be the primary v1 plugin addition.

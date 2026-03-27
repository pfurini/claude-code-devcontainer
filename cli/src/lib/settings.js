import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { mergeConfig, subtractConfig } from './merge.js';

function settingsPath(workspaceRoot) {
  return path.join(workspaceRoot, '.claude', 'settings.json');
}

/**
 * Read project-scoped .claude/settings.json. Returns {} if missing.
 * Throws if the file exists but cannot be read or contains invalid JSON.
 */
export async function readSettings(workspaceRoot) {
  try {
    const raw = await readFile(settingsPath(workspaceRoot), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to read/parse settings.json: ${err.message}`, { cause: err });
  }
}

/**
 * Write project-scoped .claude/settings.json with 2-space indent + trailing newline.
 */
export async function writeSettings(workspaceRoot, settings) {
  const dir = path.join(workspaceRoot, '.claude');
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath(workspaceRoot), JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Apply preset settings by deep-merging into existing project settings.
 * If the preset includes mcpServers, also enables auto-approval.
 */
export async function applyPresetSettings(workspaceRoot, presetSettings, hasMcpServers = false) {
  const current = await readSettings(workspaceRoot);
  const merged = mergeConfig(current, presetSettings);

  if (hasMcpServers) {
    merged.enableAllProjectMcpServers = true;
  }

  await writeSettings(workspaceRoot, merged);
}

/**
 * Remove preset settings by subtracting the stored snapshot from current settings.
 */
export async function removePresetSettings(workspaceRoot, presetSettingsSnapshot) {
  const current = await readSettings(workspaceRoot);
  const result = subtractConfig(current, presetSettingsSnapshot);
  await writeSettings(workspaceRoot, result);
}

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applyPresetSettings } from '../lib/settings.js';
import { applyPresetMcp } from '../lib/mcp.js';
import { applyPresetClaudeMd } from '../lib/claudeMd.js';
import { applyPresetSkills } from '../lib/skills.js';
import { loadState, saveState, isApplied, addApplied, ensureGitignore } from '../lib/state.js';

const presetsDir = new URL('../../presets/', import.meta.url);

/**
 * Load a preset definition by name from the presets directory.
 */
async function loadPreset(name) {
  const filePath = new URL(`${name}.json`, presetsDir);
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * List all available preset names by scanning the presets directory.
 */
export async function listAvailablePresets() {
  const files = await readdir(presetsDir);
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

/**
 * Apply one or more presets to the workspace.
 */
export async function applyCommand(presetNames) {
  const workspaceRoot = process.cwd();
  const state = await loadState(workspaceRoot);
  const available = await listAvailablePresets();
  const applied = [];

  for (const name of presetNames) {
    if (!available.includes(name)) {
      console.error(`Error: Preset "${name}" not found. Available presets: ${available.join(', ')}`);
      continue;
    }

    if (isApplied(state, name)) {
      console.warn(`Warning: Preset "${name}" is already applied, skipping.`);
      continue;
    }

    try {
      const preset = await loadPreset(name);
      const hasMcpServers = preset.mcpServers && Object.keys(preset.mcpServers).length > 0;

      if (preset.settings) {
        await applyPresetSettings(workspaceRoot, preset.settings, hasMcpServers);
      }

      if (hasMcpServers) {
        await applyPresetMcp(workspaceRoot, preset.mcpServers);
      }

      if (preset.claudeMd) {
        await applyPresetClaudeMd(workspaceRoot, preset.claudeMd);
      }

      if (preset.skills && preset.skills.length > 0) {
        await applyPresetSkills(workspaceRoot, preset.skills);
      }

      addApplied(state, name, preset.version, preset);
      await saveState(workspaceRoot, state);
      await ensureGitignore(workspaceRoot);

      applied.push(name);
      console.log(`Applied preset "${name}".`);
    } catch (err) {
      console.error(`Error applying preset "${name}": ${err.message}`);
    }
  }

  if (applied.length > 0) {
    console.log(`\nDone! Applied ${applied.length} preset(s): ${applied.join(', ')}`);
  }
}

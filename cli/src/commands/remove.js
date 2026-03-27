import { removePresetSettings } from '../lib/settings.js';
import { removePresetMcp } from '../lib/mcp.js';
import { removePresetClaudeMd } from '../lib/claudeMd.js';
import { removePresetSkills } from '../lib/skills.js';
import { loadState, saveState, removeApplied } from '../lib/state.js';

/**
 * Remove an applied preset from the workspace using its stored snapshot.
 */
export async function removeCommand(presetName) {
  const workspaceRoot = process.cwd();
  const state = await loadState(workspaceRoot);
  const entry = removeApplied(state, presetName);

  if (!entry) {
    console.error(`Error: Preset "${presetName}" is not currently applied.`);
    process.exitCode = 1;
    return;
  }

  const snapshot = entry.snapshot;

  if (snapshot.settings) {
    await removePresetSettings(workspaceRoot, snapshot.settings);
  }

  if (snapshot.mcpServers && Object.keys(snapshot.mcpServers).length > 0) {
    await removePresetMcp(workspaceRoot, snapshot.mcpServers);
  }

  if (snapshot.claudeMd) {
    await removePresetClaudeMd(workspaceRoot, snapshot.claudeMd);
  }

  if (snapshot.skills && snapshot.skills.length > 0) {
    await removePresetSkills(workspaceRoot, snapshot.skills);
  }

  await saveState(workspaceRoot, state);
  console.log(`Removed preset "${presetName}".`);
}

import { removePresetSettings } from '../lib/settings.js';
import { removePresetMcp } from '../lib/mcp.js';
import { removePresetClaudeMd } from '../lib/claudeMd.js';
import { removePresetSkills } from '../lib/skills.js';
import { loadState, saveState } from '../lib/state.js';

/**
 * Remove all applied presets from the workspace.
 */
export async function resetCommand() {
  const workspaceRoot = process.cwd();
  const state = await loadState(workspaceRoot);

  if (state.applied.length === 0) {
    console.log('No presets currently applied.');
    return;
  }

  const count = state.applied.length;

  // Iterate in reverse order to unwind cleanly
  for (let i = state.applied.length - 1; i >= 0; i--) {
    const entry = state.applied[i];
    const snapshot = entry.snapshot;

    try {
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

      console.log(`Removed preset "${entry.name}".`);
    } catch (err) {
      console.error(`Error removing preset "${entry.name}": ${err.message}`);
    }
  }

  state.applied = [];
  await saveState(workspaceRoot, state);
  console.log(`\nReset complete — removed ${count} preset(s).`);
}

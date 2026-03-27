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
  const failed = [];
  let removed = 0;

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
      removed += 1;
    } catch (err) {
      console.error(`Error removing preset "${entry.name}": ${err.message}`);
      failed.unshift(entry);
    }
  }

  state.applied = failed;
  await saveState(workspaceRoot, state);

  if (failed.length === 0) {
    console.log(`\nReset complete — removed ${count} preset(s).`);
  } else {
    console.log(
      `\nReset partial — removed ${removed} of ${count} preset(s); ${failed.length} failed (see errors above). Failed presets remain in state for retry.`,
    );
  }
}

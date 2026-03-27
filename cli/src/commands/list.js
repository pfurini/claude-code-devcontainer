import { readFile, readdir } from 'node:fs/promises';
import { loadState } from '../lib/state.js';

const presetsDir = new URL('../../presets/', import.meta.url);

/**
 * List all available presets and their applied status.
 */
export async function listCommand() {
  const workspaceRoot = process.cwd();
  const state = await loadState(workspaceRoot);

  const files = await readdir(presetsDir);
  const presetFiles = files.filter((f) => f.endsWith('.json'));

  if (presetFiles.length === 0) {
    console.log('No presets available.');
    return;
  }

  console.log('\nAvailable presets:\n');

  for (const file of presetFiles) {
    try {
      const filePath = new URL(file, presetsDir);
      const raw = await readFile(filePath, 'utf8');
      const preset = JSON.parse(raw);
      const appliedEntry = state.applied.find((e) => e.name === preset.name);

      if (appliedEntry) {
        const date = new Date(appliedEntry.appliedAt).toLocaleDateString();
        console.log(`  ${preset.name} — ${preset.description} [applied ${date}]`);
      } else {
        console.log(`  ${preset.name} — ${preset.description}`);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: skipped preset file "${file}": ${detail}`);
    }
  }

  console.log();
}

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const STATE_FILE = '.preset-state.json';
const STATE_DIR = '.claude';

function statePath(workspaceRoot) {
  return path.join(workspaceRoot, STATE_DIR, STATE_FILE);
}

/**
 * Load preset state from disk. Returns default state if file is missing.
 */
export async function loadState(workspaceRoot) {
  try {
    const raw = await readFile(statePath(workspaceRoot), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { version: 1, applied: [] };
  }
}

/**
 * Save preset state to disk.
 */
export async function saveState(workspaceRoot, state) {
  const dir = path.join(workspaceRoot, STATE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(statePath(workspaceRoot), JSON.stringify(state, null, 2) + '\n');
}

/**
 * Check if a preset is currently applied.
 */
export function isApplied(state, presetName) {
  return state.applied.some((entry) => entry.name === presetName);
}

/**
 * Add a preset entry to the applied list.
 */
export function addApplied(state, presetName, presetVersion, presetSnapshot) {
  state.applied.push({
    name: presetName,
    appliedAt: new Date().toISOString(),
    presetVersion,
    snapshot: presetSnapshot,
  });
}

/**
 * Remove a preset entry from the applied list. Returns the removed entry or null.
 */
export function removeApplied(state, presetName) {
  const idx = state.applied.findIndex((entry) => entry.name === presetName);
  if (idx === -1) return null;
  return state.applied.splice(idx, 1)[0];
}

/**
 * Ensure .preset-state.json is listed in .gitignore.
 */
export async function ensureGitignore(workspaceRoot) {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  const entry = '.claude/.preset-state.json';

  let content = '';
  try {
    content = await readFile(gitignorePath, 'utf8');
  } catch {
    // .gitignore doesn't exist yet
  }

  if (content.includes(entry)) return;

  const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  await writeFile(gitignorePath, content + separator + entry + '\n');
}

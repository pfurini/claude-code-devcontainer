import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const PRESETS_DIR = path.join('.claude', 'presets');

/**
 * Apply a preset's CLAUDE.md content: write the preset file and add an @ import.
 * @param {string} workspaceRoot
 * @param {{ file: string, content: string }} presetClaudeMd
 */
export async function applyPresetClaudeMd(workspaceRoot, presetClaudeMd) {
  const { file, content } = presetClaudeMd;
  const presetsDir = path.join(workspaceRoot, PRESETS_DIR);
  const presetFilePath = path.join(presetsDir, file);
  const claudeMdPath = path.join(workspaceRoot, 'CLAUDE.md');
  const importLine = `@${PRESETS_DIR}/${file}`;

  // Write preset markdown file
  await mkdir(presetsDir, { recursive: true });
  await writeFile(presetFilePath, content);

  // Read or create CLAUDE.md
  let claudeMd = '';
  try {
    claudeMd = await readFile(claudeMdPath, 'utf8');
  } catch {
    claudeMd = '# CLAUDE.md\n';
  }

  // Add @ import if not already present
  if (!claudeMd.includes(importLine)) {
    const separator = claudeMd.endsWith('\n') ? '' : '\n';
    claudeMd += separator + importLine + '\n';
    await writeFile(claudeMdPath, claudeMd);
  }
}

/**
 * Remove a preset's CLAUDE.md content: delete the preset file and remove the @ import.
 * @param {string} workspaceRoot
 * @param {{ file: string }} presetClaudeMd
 */
export async function removePresetClaudeMd(workspaceRoot, presetClaudeMd) {
  const { file } = presetClaudeMd;
  const presetFilePath = path.join(workspaceRoot, PRESETS_DIR, file);
  const claudeMdPath = path.join(workspaceRoot, 'CLAUDE.md');
  const importLine = `@${PRESETS_DIR}/${file}`;

  // Delete preset file
  try {
    await unlink(presetFilePath);
  } catch {
    // File already gone
  }

  // Remove @ import line from CLAUDE.md
  try {
    let claudeMd = await readFile(claudeMdPath, 'utf8');
    const lines = claudeMd.split('\n');
    const filtered = lines.filter((line) => line.trim() !== importLine);
    await writeFile(claudeMdPath, filtered.join('\n'));
  } catch {
    // CLAUDE.md doesn't exist, nothing to clean
  }
}

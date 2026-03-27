import { access, rm, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Check if a skill is already installed at project scope.
 */
async function skillExists(workspaceRoot, skillName) {
  const skillPath = path.join(workspaceRoot, '.claude', 'skills', skillName, 'SKILL.md');
  try {
    await access(skillPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install preset skills to project-scoped .claude/skills/.
 * @param {string} workspaceRoot
 * @param {{ repo: string, skill: string }[]} presetSkills
 */
export async function applyPresetSkills(workspaceRoot, presetSkills) {
  for (const { repo, skill } of presetSkills) {
    if (await skillExists(workspaceRoot, skill)) {
      console.log(`Skill "${skill}" already installed, skipping.`);
      continue;
    }

    try {
      console.log(`Installing skill "${skill}" from ${repo}...`);
      execSync(`pnpm dlx skills add ${repo} --skill ${skill} -y`, {
        cwd: workspaceRoot,
        stdio: 'inherit',
      });
      console.log(`Skill "${skill}" installed successfully.`);
    } catch (err) {
      console.error(`Failed to install skill "${skill}": ${err.message}`);
    }
  }
}

/**
 * Remove preset skills by deleting their directories.
 * @param {string} workspaceRoot
 * @param {{ repo: string, skill: string }[]} presetSkills
 */
export async function removePresetSkills(workspaceRoot, presetSkills) {
  for (const { skill } of presetSkills) {
    const skillDir = path.join(workspaceRoot, '.claude', 'skills', skill);
    try {
      await rm(skillDir, { recursive: true, force: true });
      console.log(`Skill "${skill}" removed.`);
    } catch {
      // Directory doesn't exist
    }
  }
}

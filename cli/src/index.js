#!/usr/bin/env node

import { program } from 'commander';
import { intro, outro, multiselect, confirm, isCancel } from '@clack/prompts';
import { applyCommand, listAvailablePresets } from './commands/apply.js';
import { removeCommand } from './commands/remove.js';
import { listCommand } from './commands/list.js';
import { resetCommand } from './commands/reset.js';
import { loadState, isApplied } from './lib/state.js';
import { readFile } from 'node:fs/promises';
import pkg from '../package.json' with { type: 'json' };

const presetsDir = new URL('../presets/', import.meta.url);

/**
 * Interactive TUI mode: show multiselect of available presets.
 */
async function interactiveMode() {
  intro('claude-preset');

  const workspaceRoot = process.cwd();
  const state = await loadState(workspaceRoot);
  const available = await listAvailablePresets();

  if (available.length === 0) {
    outro('No presets available.');
    return;
  }

  // Build options with descriptions and applied status (parallel reads, order matches `available`)
  const options = await Promise.all(
    available.map(async (name) => {
      const filePath = new URL(`${name}.json`, presetsDir);
      const raw = await readFile(filePath, 'utf8');
      const preset = JSON.parse(raw);
      const applied = isApplied(state, name);
      const label = applied ? `${preset.name} (applied)` : preset.name;
      return {
        value: name,
        label,
        hint: preset.description,
      };
    }),
  );

  const selected = await multiselect({
    message: 'Select presets to apply',
    options,
    required: false,
  });

  if (isCancel(selected)) {
    outro('Cancelled.');
    return;
  }

  if (selected.length === 0) {
    outro('No presets selected.');
    return;
  }

  const proceed = await confirm({
    message: `Apply ${selected.length} preset(s): ${selected.join(', ')}?`,
  });

  if (isCancel(proceed) || !proceed) {
    outro('Cancelled.');
    return;
  }

  await applyCommand(selected);
  outro('Done!');
}

// Check for bare invocation (no subcommand)
if (process.argv.length <= 2) {
  interactiveMode().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
} else {
  program
    .name('claude-preset')
    .description('Configure Claude Code with technology presets')
    .version(pkg.version);

  program
    .command('apply <presets...>')
    .description('Apply one or more presets')
    .action(applyCommand);

  program
    .command('remove <preset>')
    .description('Remove an applied preset')
    .action(removeCommand);

  program
    .command('list')
    .description('List available presets')
    .action(listCommand);

  program
    .command('reset')
    .description('Remove all applied presets')
    .action(resetCommand);

  program.parse();
}

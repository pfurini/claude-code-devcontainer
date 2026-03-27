import { readSettings, writeSettings } from './settings.js';

/**
 * Apply preset plugins by writing enabledPlugins and extraKnownMarketplaces
 * to .claude/settings.json. Uses direct-write pattern consistent with mcp.js
 * and settings.js (no shell-out to `claude plugin install`).
 *
 * @param {string} workspaceRoot
 * @param {{ name: string, marketplace: string, scope?: string }[]} presetPlugins
 * @param {Record<string, object>} presetMarketplaces  marketplace key -> { source: {...} }
 */
export async function applyPresetPlugins(workspaceRoot, presetPlugins, presetMarketplaces = {}) {
  const settings = await readSettings(workspaceRoot);

  // Register non-official marketplaces before enabling plugins (R2 mitigation).
  // Skip claude-plugins-official — it is always available and needs no registration.
  const marketplaceKeys = Object.keys(presetMarketplaces).filter(
    (k) => k !== 'claude-plugins-official'
  );
  if (marketplaceKeys.length > 0) {
    settings.extraKnownMarketplaces = settings.extraKnownMarketplaces ?? {};
    for (const key of marketplaceKeys) {
      settings.extraKnownMarketplaces[key] = presetMarketplaces[key];
    }
  }

  // Enable plugins. Respect user-disabled plugins (R4 mitigation).
  settings.enabledPlugins = settings.enabledPlugins ?? {};
  for (const { name, marketplace } of presetPlugins) {
    const pluginId = `${name}@${marketplace}`;
    if (settings.enabledPlugins[pluginId] === false) {
      console.warn(`Plugin "${pluginId}" is explicitly disabled by user, skipping.`);
      continue;
    }
    settings.enabledPlugins[pluginId] = true;
  }

  await writeSettings(workspaceRoot, settings);
  console.log('Plugin(s) configured. Restart Claude Code to activate them.');
}

/**
 * Remove preset plugins by deleting their enabledPlugins entries from
 * .claude/settings.json. Uses the snapshot stored at apply time so removals
 * are precise even if the preset definition has changed since.
 *
 * @param {string} workspaceRoot
 * @param {{ name: string, marketplace: string }[]} presetPluginsSnapshot
 * @param {Record<string, object>} presetMarketplacesSnapshot
 */
export async function removePresetPlugins(workspaceRoot, presetPluginsSnapshot, presetMarketplacesSnapshot = {}) {
  const settings = await readSettings(workspaceRoot);

  if (settings.enabledPlugins) {
    for (const { name, marketplace } of presetPluginsSnapshot) {
      const pluginId = `${name}@${marketplace}`;
      delete settings.enabledPlugins[pluginId];
    }
    if (Object.keys(settings.enabledPlugins).length === 0) {
      delete settings.enabledPlugins;
    }
  }

  // Marketplace entries are intentionally left in place on remove (R3 decision).
  // They are harmless (just tells Claude Code about a marketplace) and avoiding
  // cross-preset reference checks keeps the code simple. Another preset may still
  // reference the same marketplace.

  await writeSettings(workspaceRoot, settings);
}

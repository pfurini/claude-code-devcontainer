import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

function mcpPath(workspaceRoot) {
  return path.join(workspaceRoot, '.mcp.json');
}

/**
 * Read .mcp.json from workspace root. Returns { mcpServers: {} } if missing.
 */
export async function readMcpConfig(workspaceRoot) {
  try {
    const raw = await readFile(mcpPath(workspaceRoot), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { mcpServers: {} };
  }
}

/**
 * Write .mcp.json with 2-space indent + trailing newline.
 */
export async function writeMcpConfig(workspaceRoot, config) {
  await writeFile(mcpPath(workspaceRoot), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Apply preset MCP servers by merging into existing .mcp.json.
 * Server entries are replaced by key (object merge, not deep merge).
 */
export async function applyPresetMcp(workspaceRoot, presetMcpServers) {
  const config = await readMcpConfig(workspaceRoot);
  config.mcpServers = { ...config.mcpServers, ...presetMcpServers };
  await writeMcpConfig(workspaceRoot, config);
}

/**
 * Remove preset MCP servers by deleting keys present in the snapshot.
 * Deletes the file entirely if no servers remain.
 */
export async function removePresetMcp(workspaceRoot, presetMcpServersSnapshot) {
  const config = await readMcpConfig(workspaceRoot);

  for (const key of Object.keys(presetMcpServersSnapshot)) {
    delete config.mcpServers[key];
  }

  if (Object.keys(config.mcpServers).length === 0) {
    try {
      await unlink(mcpPath(workspaceRoot));
    } catch {
      // File already gone
    }
  } else {
    await writeMcpConfig(workspaceRoot, config);
  }
}

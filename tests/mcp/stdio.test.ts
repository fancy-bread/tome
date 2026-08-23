// Proves the stdio transport actually works end-to-end (E1 from
// /speckit-analyze): a real child process, spawned the way a host agent
// would spawn it, speaking MCP over its real stdin/stdout — not the
// in-memory transport the rest of tests/mcp/ uses for speed.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('MCP server — stdio transport', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tome-stdio-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('lists tools over a real spawned process using the stdio transport', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(process.cwd(), 'dist', 'index.js')],
      env: { CLAUDE_PLUGIN_DATA_DIR: dataDir },
    });
    const client = new Client({ name: 'tome-stdio-test-client', version: '0.0.1' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name).sort();
      expect(names).toEqual(
        ['tome_add_source', 'tome_fetch', 'tome_list_sources', 'tome_remove_source', 'tome_search'].sort(),
      );
    } finally {
      await client.close();
    }
  });
});

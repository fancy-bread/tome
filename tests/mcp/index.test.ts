import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer, handleFatalError, resolveDbPath } from '../../src/index.js';

describe('resolveDbPath', () => {
  it('uses CLAUDE_PLUGIN_DATA when set', () => {
    expect(resolveDbPath({ CLAUDE_PLUGIN_DATA: '/custom/data/dir' })).toBe(
      join('/custom/data/dir', 'index.db'),
    );
  });

  it('falls back to a fixed default when CLAUDE_PLUGIN_DATA is unset', () => {
    expect(resolveDbPath({})).toBe(join(homedir(), '.claude', 'plugins', 'tome', 'index.db'));
  });

  it('falls back to a fixed default when CLAUDE_PLUGIN_DATA is an unexpanded placeholder', () => {
    expect(resolveDbPath({ CLAUDE_PLUGIN_DATA: '${CLAUDE_PLUGIN_DATA}' })).toBe(
      join(homedir(), '.claude', 'plugins', 'tome', 'index.db'),
    );
  });
});

describe('buildServer', () => {
  let dataDir: string;

  afterEach(async () => {
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('creates the data directory and returns a real, fully-wired server', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tome-build-server-'));
    dataDir = join(base, 'nested', 'data-dir');
    expect(existsSync(dataDir)).toBe(false);

    const server = await buildServer({ CLAUDE_PLUGIN_DATA: dataDir });
    expect(existsSync(dataDir)).toBe(true);

    // Prove it's a real, working server — connect over an in-memory
    // transport (same pattern as tests/mcp/test-client.ts) and confirm
    // all five tools are discoverable, without binding process.stdin/stdout.
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'index-test-client', version: '0.0.1' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(
      ['tome_add_source', 'tome_fetch', 'tome_list_sources', 'tome_remove_source', 'tome_search'].sort(),
    );
  });
});

describe('handleFatalError', () => {
  it('logs the error and exits with status 1', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const err = new Error('boom');

    handleFatalError(err);

    expect(errorSpy).toHaveBeenCalledWith(err);
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

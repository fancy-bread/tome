// Proves SC-002: a full add → search → fetch → list sequence works
// through the real MCP protocol against a real SqliteDocumentIndex, not
// an in-memory fake — the daemon's actual production wiring minus the
// stdio transport itself (see stdio.test.ts for that).

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Embedder } from '../../src/core/embedder.js';
import { SqliteDocumentIndex } from '../../src/storage/sqlite-document-index.js';
import { connectTestClient } from './test-client.js';

class NoOpEmbedder implements Embedder {
  async embed(): Promise<number[] | null> {
    return null;
  }
}

async function waitUntilReady(index: SqliteDocumentIndex, sourceId: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const sources = await index.listSources();
    const source = sources.find((s) => s.id === sourceId);
    if (source?.status === 'ready' || source?.status === 'error') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`source ${sourceId} did not finish indexing in time`);
}

describe('MCP server — end-to-end (SC-002)', () => {
  let dir: string;
  let index: SqliteDocumentIndex;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-e2e-'));
    await writeFile(join(dir, 'guide.md'), '# Widget Guide\n\nWidgets are great for building things.');
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: new NoOpEmbedder() });
  });

  afterEach(async () => {
    index.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('adds a source, then searches, fetches, and lists it — all through MCP tool calls', async () => {
    const client = await connectTestClient(index);

    const addResult = await client.callTool({
      name: 'tome_add_source',
      arguments: { type: 'path', origin: dir },
    });
    expect(addResult.isError).toBeFalsy();
    const { sourceId } = JSON.parse((addResult.content as Array<{ type: 'text'; text: string }>)[0].text);

    await waitUntilReady(index, sourceId);

    const searchResult = await client.callTool({
      name: 'tome_search',
      arguments: { query: 'widgets' },
    });
    expect(searchResult.isError).toBeFalsy();
    const { results } = JSON.parse((searchResult.content as Array<{ type: 'text'; text: string }>)[0].text);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sourceId).toBe(sourceId);

    const fetchResult = await client.callTool({
      name: 'tome_fetch',
      arguments: { id: results[0].chunkId },
    });
    expect(fetchResult.isError).toBeFalsy();
    const fetched = JSON.parse((fetchResult.content as Array<{ type: 'text'; text: string }>)[0].text);
    expect(fetched).toMatchObject({ type: 'chunk', id: results[0].chunkId });

    const listResult = await client.callTool({ name: 'tome_list_sources', arguments: {} });
    expect(listResult.isError).toBeFalsy();
    const { sources } = JSON.parse((listResult.content as Array<{ type: 'text'; text: string }>)[0].text);
    expect(sources).toContainEqual(expect.objectContaining({ id: sourceId, status: 'ready' }));
  });
});

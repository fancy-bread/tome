import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteDocumentIndex } from '../../src/storage/sqlite-document-index.js';
import type { Source } from '../../src/core/types.js';

class StubEmbedder {
  async embed(): Promise<number[] | null> {
    return null;
  }
}

async function waitForSettled(
  index: SqliteDocumentIndex,
  sourceId: string,
  timeoutMs = 2000,
): Promise<Source> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const sources = await index.listSources();
    const source = sources.find((s) => s.id === sourceId);
    if (source && (source.status === 'ready' || source.status === 'error')) return source;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Source ${sourceId} did not settle within ${timeoutMs}ms`);
}

describe('SqliteDocumentIndex orchestration (User Story 1)', () => {
  let dir: string;
  let index: SqliteDocumentIndex;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-orchestration-'));
    await writeFile(join(dir, 'guide.md'), '# Installation Guide\n\nHow to install the widget.');
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: new StubEmbedder() });
  });

  afterEach(async () => {
    index.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('returns immediately with pending/indexing status, before crawling necessarily finishes (SC-001)', async () => {
    const source = await index.addSource({ type: 'path', origin: dir });
    expect(['pending', 'indexing']).toContain(source.status);
  });

  it('settles to ready with lastIndexedAt, and its content becomes searchable', async () => {
    const added = await index.addSource({ type: 'path', origin: dir });
    const settled = await waitForSettled(index, added.id);

    expect(settled.status).toBe('ready');
    expect(settled.lastIndexedAt).not.toBeNull();

    const results = await index.search('installation guide');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.source.id === added.id)).toBe(true);
  });

  it('returns an empty array for a whitespace-only query, rather than an invalid FTS5 query', async () => {
    const added = await index.addSource({ type: 'path', origin: dir });
    await waitForSettled(index, added.id);

    expect(await index.search('')).toEqual([]);
    expect(await index.search('   ')).toEqual([]);
  });

  it('settles to error, without an unhandled rejection, when the source cannot be read (SC-005)', async () => {
    const added = await index.addSource({ type: 'path', origin: join(dir, 'does-not-exist') });
    const settled = await waitForSettled(index, added.id);

    expect(settled.status).toBe('error');
    expect(settled.error).not.toBeNull();
  });
});

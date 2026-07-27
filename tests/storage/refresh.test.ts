import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteDocumentIndex } from '../../src/storage/sqlite-document-index.js';
import type { RankedChunk, Source } from '../../src/core/types.js';

class StubEmbedder {
  async embed(): Promise<number[] | null> {
    return null;
  }
}

async function waitForSettled(index: SqliteDocumentIndex, sourceId: string, timeoutMs = 2000): Promise<Source> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const source = (await index.listSources()).find((s) => s.id === sourceId);
    if (source && (source.status === 'ready' || source.status === 'error')) return source;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Source ${sourceId} did not settle within ${timeoutMs}ms`);
}

async function findChunk(index: SqliteDocumentIndex, query: string): Promise<RankedChunk> {
  const results = await index.search(query);
  if (results.length === 0) throw new Error(`No results for query: ${query}`);
  return results[0];
}

describe('SqliteDocumentIndex refresh (User Story 5)', () => {
  let dir: string;
  let index: SqliteDocumentIndex;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-refresh-'));
    await writeFile(join(dir, 'a.md'), '# A\n\nOriginal alpha content here.');
    await writeFile(join(dir, 'b.md'), '# B\n\nUnrelated beta content, never changes.');
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: new StubEmbedder() });
  });

  afterEach(async () => {
    index.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('a no-op refresh leaves every chunk identical, but the refresh itself actually ran (FR-013, SC-004)', async () => {
    const added = await index.addSource({ type: 'path', origin: dir });
    const first = await waitForSettled(index, added.id);

    const alphaBefore = await findChunk(index, 'alpha');
    const betaBefore = await findChunk(index, 'beta');

    await new Promise((resolve) => setTimeout(resolve, 5)); // ensure a distinguishable timestamp

    const refreshed = await index.addSource({ type: 'path', origin: dir }); // same origin, no changes
    const second = await waitForSettled(index, refreshed.id);

    // The refresh must have actually run (not been swallowed as
    // "already in-flight" from the first, now-settled job) — F2's fix.
    expect(second.lastIndexedAt).not.toBeNull();
    expect(second.lastIndexedAt!).toBeGreaterThan(first.lastIndexedAt!);

    const alphaAfter = await findChunk(index, 'alpha');
    const betaAfter = await findChunk(index, 'beta');
    expect(alphaAfter.chunk).toEqual(alphaBefore.chunk);
    expect(betaAfter.chunk).toEqual(betaBefore.chunk);
  });

  it('refreshing after one document changed replaces only that document\'s chunks (FR-014)', async () => {
    const added = await index.addSource({ type: 'path', origin: dir });
    await waitForSettled(index, added.id);

    const betaBefore = await findChunk(index, 'beta');

    await writeFile(join(dir, 'a.md'), '# A\n\nCompletely different gamma content now.');
    const refreshed = await index.addSource({ type: 'path', origin: dir });
    await waitForSettled(index, refreshed.id);

    const gamma = await findChunk(index, 'gamma');
    expect(gamma.document.id).toBeTruthy();
    const alphaResults = await index.search('alpha');
    expect(alphaResults).toEqual([]); // old content is gone

    const betaAfter = await findChunk(index, 'beta');
    expect(betaAfter.chunk).toEqual(betaBefore.chunk); // untouched
  });

  it('two concurrent addSource calls for an in-flight origin result in exactly one indexed source (FR-015)', async () => {
    const [a, b] = await Promise.all([
      index.addSource({ type: 'path', origin: dir }),
      index.addSource({ type: 'path', origin: dir }),
    ]);
    expect(a.id).toBe(b.id);

    const settled = await waitForSettled(index, a.id);
    expect(settled.status).toBe('ready');

    const sources = await index.listSources();
    expect(sources.filter((s) => s.origin === dir)).toHaveLength(1);
  });
});

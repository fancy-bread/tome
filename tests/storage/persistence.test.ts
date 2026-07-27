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

async function waitForSettled(index: SqliteDocumentIndex, sourceId: string, timeoutMs = 2000): Promise<Source> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const source = (await index.listSources()).find((s) => s.id === sourceId);
    if (source && (source.status === 'ready' || source.status === 'error')) return source;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Source ${sourceId} did not settle within ${timeoutMs}ms`);
}

describe('SqliteDocumentIndex cross-restart persistence (SC-002)', () => {
  let sourceDir: string;
  let dbDir: string;
  let dbPath: string;

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), 'tome-persistence-source-'));
    await writeFile(join(sourceDir, 'guide.md'), '# Guide\n\nPersisted installation content.');
    dbDir = await mkdtemp(join(tmpdir(), 'tome-persistence-db-'));
    dbPath = join(dbDir, 'index.db');
  });

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(dbDir, { recursive: true, force: true });
  });

  it('data survives closing the index and opening a new instance against the same file', async () => {
    const first = new SqliteDocumentIndex({ dbPath, embedder: new StubEmbedder() });
    const added = await first.addSource({ type: 'path', origin: sourceDir });
    await waitForSettled(first, added.id);
    first.close();

    const second = new SqliteDocumentIndex({ dbPath, embedder: new StubEmbedder() });
    try {
      const sources = await second.listSources();
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe(added.id);
      expect(sources[0].status).toBe('ready');

      const results = await second.search('installation');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source.id).toBe(added.id);
    } finally {
      second.close();
    }
  });
});

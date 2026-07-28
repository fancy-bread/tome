import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { OllamaEmbedder } from '../../src/embedding/ollama-embedder.js';
import { SqliteDocumentIndex } from '../../src/storage/sqlite-document-index.js';
import type { Embedder } from '../../src/core/embedder.js';
import type { Source } from '../../src/core/types.js';

const FIXED_VECTOR = Array.from({ length: 768 }, (_, i) => i / 768);

class AlwaysNullEmbedder implements Embedder {
  async embed(): Promise<number[] | null> {
    return null;
  }
}

class ToggleableEmbedder implements Embedder {
  succeed = false;
  async embed(): Promise<number[] | null> {
    return this.succeed ? FIXED_VECTOR : null;
  }
}

class AlwaysSucceedsEmbedder implements Embedder {
  async embed(): Promise<number[] | null> {
    return FIXED_VECTOR;
  }
}

class SlowSucceedingEmbedder implements Embedder {
  callCount = 0;
  constructor(private delayMs: number) {}
  async embed(): Promise<number[] | null> {
    this.callCount++;
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return FIXED_VECTOR;
  }
}

/** Delays only for text containing `slowMarker`; resolves everything
 * else immediately — lets a test slow down one specific (e.g.
 * reconciliation-targeted) chunk without also slowing down unrelated
 * chunks embedded via the same Embedder instance. */
class SelectivelySlowEmbedder implements Embedder {
  constructor(private slowMarker: string, readonly delayMs: number) {}
  async embed(text: string): Promise<number[] | null> {
    if (text.includes(this.slowMarker)) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return FIXED_VECTOR;
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

async function waitUntil(predicate: () => Promise<boolean> | boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

describe('SqliteDocumentIndex — User Story 1: Semantic Search Actually Ranks by Meaning (SC-001)', () => {
  let server: Server;
  let baseUrl: string;
  let dir: string;
  let index: SqliteDocumentIndex;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ embedding: FIXED_VECTOR }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  afterEach(async () => {
    index.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('ranks content by vector similarity for a query sharing no keywords with it', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-reconciliation-us1-'));
    await writeFile(join(dir, 'guide.md'), '# Zorbnax Manual\n\nThe zorbnax spins the flibberjack.');
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: new OllamaEmbedder({ baseUrl }) });

    const source = await index.addSource({ type: 'path', origin: dir });
    await waitForSettled(index, source.id);

    const results = await index.search('completely unrelated query text');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rankedBy).toBe('vector');
  });
});

describe('SqliteDocumentIndex — User Story 2: Indexing Never Fails Just Because Embedding Is Down (SC-002)', () => {
  let dir: string;
  let index: SqliteDocumentIndex;

  afterEach(async () => {
    index.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('reaches ready and remains searchable by keyword when the embedder always fails', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-reconciliation-us2-'));
    await writeFile(join(dir, 'guide.md'), '# Widget Guide\n\nHow to install the widget.');
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: new AlwaysNullEmbedder() });

    const source = await index.addSource({ type: 'path', origin: dir });
    const settled = await waitForSettled(index, source.id);

    expect(settled.status).toBe('ready');
    const results = await index.search('widget');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rankedBy).toBe('lexical');
  });

  it('handles a single source with a mix of per-chunk embedding successes and failures', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-reconciliation-us2-mixed-'));
    // Two paragraphs, each long enough that the chunker splits them into
    // separate chunks (target ~2000 chars/chunk).
    const paragraphA = `# ALPHAMARKER Section\n\n${'Alpha content filler text. '.repeat(90)}`;
    const paragraphB = `# BETAMARKER Section\n\n${'Beta content filler text. '.repeat(90)}`;
    await writeFile(join(dir, 'guide.md'), `${paragraphA}\n\n${paragraphB}`);

    class MixedEmbedder implements Embedder {
      async embed(text: string): Promise<number[] | null> {
        return text.includes('ALPHAMARKER') ? FIXED_VECTOR : null;
      }
    }
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: new MixedEmbedder() });

    const source = await index.addSource({ type: 'path', origin: dir });
    const settled = await waitForSettled(index, source.id);
    expect(settled.status).toBe('ready');

    const alphaResults = await index.search('ALPHAMARKER');
    expect(alphaResults.length).toBeGreaterThan(0);
    expect(alphaResults[0].rankedBy).toBe('vector');

    const betaResults = await index.search('BETAMARKER');
    expect(betaResults.length).toBeGreaterThan(0);
    expect(betaResults[0].rankedBy).toBe('lexical');
  });
});

describe('SqliteDocumentIndex — User Story 3: Content Catches Up Automatically Once Embedding Recovers', () => {
  let dir: string;
  let index: SqliteDocumentIndex;

  afterEach(async () => {
    index.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('reconciles a null-embedding chunk once the embedder starts succeeding (SC-003, FR-007)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-reconciliation-us3-recover-'));
    await writeFile(join(dir, 'guide.md'), '# Gadget Guide\n\nHow to configure the gadget.');
    const embedder = new ToggleableEmbedder();
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder, reconciliationIntervalMs: 20 });

    const source = await index.addSource({ type: 'path', origin: dir });
    await waitForSettled(index, source.id);

    const beforeToggle = await index.search('gadget');
    expect(beforeToggle[0].rankedBy).toBe('lexical');

    embedder.succeed = true;
    await waitUntil(async () => {
      const results = await index.search('gadget');
      return results.length > 0 && results[0].rankedBy === 'vector';
    });
  });

  it('leaves a chunk lexically-searchable and eligible for a later attempt when reconciliation still fails (FR-008)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-reconciliation-us3-still-fails-'));
    await writeFile(join(dir, 'guide.md'), '# Sprocket Guide\n\nHow to align the sprocket.');
    const embedder = new ToggleableEmbedder();
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder, reconciliationIntervalMs: 20 });

    const source = await index.addSource({ type: 'path', origin: dir });
    await waitForSettled(index, source.id);

    // Let several reconciliation passes elapse while the embedder keeps failing.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stillFailing = await index.search('sprocket');
    expect(stillFailing.length).toBeGreaterThan(0);
    expect(stillFailing[0].rankedBy).toBe('lexical');

    // Now let it succeed — proving the earlier failed passes didn't
    // permanently mark the chunk as skipped.
    embedder.succeed = true;
    await waitUntil(async () => {
      const results = await index.search('sprocket');
      return results.length > 0 && results[0].rankedBy === 'vector';
    });
  });

  it('runs a reconciliation pass at startup, independent of the recurring interval (FR-006)', async () => {
    const dbDir = await mkdtemp(join(tmpdir(), 'tome-reconciliation-us3-startup-db-'));
    const dbPath = join(dbDir, 'index.db');

    try {
      const first = new SqliteDocumentIndex({ dbPath, embedder: new AlwaysNullEmbedder() });
      const source = first.seedSource();
      const document = first.seedDocument(source.id);
      const chunk = first.seedChunk(document.id, { text: 'leftover chunk from a prior run' });
      first.close();

      // reconciliationIntervalMs is deliberately far longer than this
      // test's timeout, so the recurring schedule cannot plausibly have
      // fired — only the startup pass could be responsible for
      // reconciling `chunk` below.
      index = new SqliteDocumentIndex({
        dbPath,
        embedder: new AlwaysSucceedsEmbedder(),
        reconciliationIntervalMs: 10_000_000,
      });

      await waitUntil(async () => {
        const fetched = await index.fetch(chunk.id);
        return 'embedding' in fetched && fetched.embedding !== null;
      });
    } finally {
      await rm(dbDir, { recursive: true, force: true });
    }
  });

  it('does not block a concurrent addSource or search while a reconciliation pass is in flight (SC-005, FR-009)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-reconciliation-us3-concurrent-'));
    await writeFile(join(dir, 'guide.md'), '# Concurrent Guide\n\nConcurrent content for searching.');
    // Only the pre-seeded reconciliation candidate below is slow to
    // embed; addSource's own new content embeds immediately, so any
    // delay measured on addSource/search can only be attributed to
    // reconciliation blocking them, not to their own embedding cost.
    const slowEmbedder = new SelectivelySlowEmbedder('awaiting reconciliation', 300);
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: slowEmbedder, reconciliationIntervalMs: 20 });

    const source = index.seedSource();
    const document = index.seedDocument(source.id);
    index.seedChunk(document.id, { text: 'a chunk awaiting reconciliation' });

    // Give the startup reconciliation pass a moment to begin (it will be
    // in flight, slowed by slowEmbedder's delay) before issuing
    // unrelated operations that must not wait on it.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const start = Date.now();
    const added = await index.addSource({ type: 'path', origin: dir });
    await waitForSettled(index, added.id);
    const results = await index.search('concurrent');
    const elapsed = Date.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(slowEmbedder.delayMs);
  });

  it('does not produce duplicate or conflicting embedding attempts across overlapping reconciliation passes (FR-010)', async () => {
    const slowEmbedder = new SlowSucceedingEmbedder(100);
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: slowEmbedder, reconciliationIntervalMs: 10 });

    const source = index.seedSource();
    const document = index.seedDocument(source.id);
    const chunk = index.seedChunk(document.id, { text: 'a single chunk targeted by overlapping passes' });

    // Several interval ticks fire while the first pass is still resolving.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const fetched = await index.fetch(chunk.id);
    expect('embedding' in fetched && fetched.embedding).not.toBeNull();
    expect(slowEmbedder.callCount).toBe(1);
  });
});

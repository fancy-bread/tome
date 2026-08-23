// User Story 3 (008-remove-source): proves research.md's Decision
// actually closes the in-flight-job race, not just that it compiles.
// SqliteDocumentIndex only — InMemoryDocumentIndex has no background
// job to race against, so this can't be part of the shared contract
// suite (see plan.md's Technical Context).

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

/**
 * Blocks every `embed()` call until `release()` is called — lets a test
 * deterministically catch `runIndexingJob` mid-way through a document's
 * chunk-embedding loop, the exact race window a natural-timing test
 * can't reliably hit for a single small local file (crawl + chunk +
 * embed all complete before a test could plausibly interleave anything
 * against it).
 */
class GatedEmbedder {
  release!: () => void;
  private gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  embedCallCount = 0;

  async embed(): Promise<number[] | null> {
    this.embedCallCount++;
    await this.gate;
    return null;
  }
}

async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition not met in time');
}

async function waitForSettled(index: SqliteDocumentIndex, sourceId: string, timeoutMs = 2000): Promise<Source | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const source = (await index.listSources()).find((s) => s.id === sourceId);
    if (!source) return undefined; // already removed — a valid end state here
    if (source.status === 'ready' || source.status === 'error') return source;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Source ${sourceId} did not settle within ${timeoutMs}ms`);
}

describe('SqliteDocumentIndex.removeSource — in-flight-job race (User Story 3, 008-remove-source)', () => {
  let dir: string;
  let index: SqliteDocumentIndex;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-remove-race-'));
    await writeFile(join(dir, 'guide.md'), '# Guide\n\nRemoval race target content.');
    index = new SqliteDocumentIndex({ dbPath: ':memory:', embedder: new StubEmbedder() });
  });

  afterEach(async () => {
    index.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('never lets a source reappear or its content become searchable if removed before its background indexing settles', async () => {
    const added = await index.addSource({ type: 'path', origin: dir });

    // No waitForSettled here — removeSource is called while the
    // background job (kicked off inside addSource, not awaited by it)
    // is still very likely mid-crawl, the same natural-scheduling
    // reliance the existing FR-015 concurrent-addSource test already
    // uses rather than an artificial sleep.
    await index.removeSource(added.id);

    // Give whatever the background job would have done time to finish
    // (or to have already finished) — either way, the assertions below
    // must hold once nothing further can happen.
    await waitForSettled(index, added.id);

    const sources = await index.listSources();
    expect(sources.find((s) => s.id === added.id)).toBeUndefined();

    const results = await index.search('removal race target');
    expect(results).toEqual([]);
  });

  it('deterministically closes the race: removal mid-chunk-embedding leaves no orphaned document or chunk behind', async () => {
    const embedder = new GatedEmbedder();
    const gatedIndex = new SqliteDocumentIndex({ dbPath: ':memory:', embedder });
    try {
      const added = await gatedIndex.addSource({ type: 'path', origin: dir });

      // Wait until the background job has actually reached embed() and
      // is blocked on it — proves we're catching it mid-chunk-loop,
      // after the crawl/chunk step but strictly before any write for
      // this document, not just "sometime before it settles."
      await waitUntil(() => embedder.embedCallCount > 0);

      await gatedIndex.removeSource(added.id);
      embedder.release(); // let the now-guarded job finish running (it should write nothing)

      // Only the interesting event (removal landing mid-embed) needed
      // to be deterministic, via the gate above — what's left after
      // release() is guaranteed-fast (no more real I/O), so a short
      // buffer for it to finish is safe, not a race.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const sources = await gatedIndex.listSources();
      expect(sources.find((s) => s.id === added.id)).toBeUndefined();

      const results = await gatedIndex.search('removal race target');
      expect(results).toEqual([]);
    } finally {
      gatedIndex.close();
    }
  });

  it('removing one source leaves another source completely unaffected (SC-004/FR-007)', async () => {
    const otherDir = await mkdtemp(join(tmpdir(), 'tome-remove-other-'));
    try {
      await writeFile(join(otherDir, 'other.md'), '# Other\n\nUntouched other-source content.');

      const target = await index.addSource({ type: 'path', origin: dir });
      const other = await index.addSource({ type: 'path', origin: otherDir });
      await waitForSettled(index, target.id);
      await waitForSettled(index, other.id);

      const otherResultsBefore = await index.search('untouched other-source');
      expect(otherResultsBefore.length).toBeGreaterThan(0);

      await index.removeSource(target.id);

      const sources = await index.listSources();
      expect(sources.find((s) => s.id === other.id)).toMatchObject({ id: other.id, status: 'ready' });

      const otherResultsAfter = await index.search('untouched other-source');
      expect(otherResultsAfter).toEqual(otherResultsBefore);

      const otherFetch = await index.fetch(otherResultsBefore[0].chunk.id);
      expect(otherFetch).toEqual(otherResultsBefore[0].chunk);
    } finally {
      await rm(otherDir, { recursive: true, force: true });
    }
  });
});

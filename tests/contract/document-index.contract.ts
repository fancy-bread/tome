// Shared contract-test suite for any DocumentIndex implementation.
// Run against an in-memory fake now (milestone 001); re-run unchanged
// against SqliteDocumentIndex in milestone 003 to prove SC-003.
//
// The suite needs seeded data (sources/documents/chunks) to exercise
// search/fetch/listSources meaningfully, but milestone 001 has no
// ingestion pipeline yet to produce that data through the public
// DocumentIndex interface alone. TestableDocumentIndex is a test-only
// extension — any implementation this suite runs against must provide
// these seeding methods in addition to the production DocumentIndex
// contract; the four DocumentIndex methods themselves stay free of any
// storage-leaking concept like "seed" (FR-011).

import { describe, expect, it } from 'vitest';
import type { DocumentIndex } from '../../src/core/document-index.js';
import { NotFoundError } from '../../src/core/document-index.js';
import type { Embedder } from '../../src/core/embedder.js';
import type { Chunk, Document, Source } from '../../src/core/types.js';
import { FakeEmbedder } from './in-memory-document-index.js';

export interface DocumentIndexTestSeed {
  seedSource(overrides?: Partial<Source>): Source;
  seedDocument(sourceId: string, overrides?: Partial<Document>): Document;
  seedChunk(documentId: string, overrides?: Partial<Chunk>): Chunk;
}

export type TestableDocumentIndex = DocumentIndex & DocumentIndexTestSeed;

export function runDocumentIndexContractTests(
  makeIndex: (embedder: Embedder) => TestableDocumentIndex,
): void {
  describe('DocumentIndex contract', () => {
    describe('User Story 1 — Add a Source', () => {
      it('returns a unique id with pending/indexing status for a new source', async () => {
        const index = makeIndex(new FakeEmbedder());
        const source = await index.addSource({ type: 'url', origin: 'https://example.com/docs' });
        expect(source.id).toBeTruthy();
        expect(['pending', 'indexing']).toContain(source.status);
      });

      it('resubmitting an existing origin returns the same identifier, not a new one', async () => {
        const index = makeIndex(new FakeEmbedder());
        const first = await index.addSource({ type: 'url', origin: 'https://example.com/docs' });
        const second = await index.addSource({ type: 'url', origin: 'https://example.com/docs' });
        expect(second.id).toBe(first.id);
      });

      it('two concurrent submissions of a new origin result in exactly one record', async () => {
        const index = makeIndex(new FakeEmbedder());
        const [a, b] = await Promise.all([
          index.addSource({ type: 'url', origin: 'https://example.com/concurrent' }),
          index.addSource({ type: 'url', origin: 'https://example.com/concurrent' }),
        ]);
        expect(a.id).toBe(b.id);
      });
    });

    describe('User Story 2 — Search Indexed Content', () => {
      it('returns relevant chunks ranked and labeled with their ranking method', async () => {
        const index = makeIndex(new FakeEmbedder());
        const source = index.seedSource();
        const document = index.seedDocument(source.id);
        index.seedChunk(document.id, { text: 'installation guide', embedding: [1, 0] });

        const results = await index.search('installation guide');
        expect(results).toHaveLength(1);
        expect(results[0].rankedBy).toBe('vector');
      });

      it('still returns results, ranked lexically, when semantic ranking is unavailable', async () => {
        const embedder = new FakeEmbedder();
        const index = makeIndex(embedder);
        const source = index.seedSource();
        const document = index.seedDocument(source.id);
        index.seedChunk(document.id, { text: 'installation guide', embedding: [1, 0] });

        embedder.setAvailable(false);
        const results = await index.search('installation guide');
        expect(results).toHaveLength(1);
        expect(results[0].rankedBy).toBe('lexical');
      });

      it('returns an empty array when no indexed content matches the query', async () => {
        const index = makeIndex(new FakeEmbedder());
        const source = index.seedSource();
        const document = index.seedDocument(source.id);
        index.seedChunk(document.id, { text: 'installation guide' });

        const results = await index.search('unrelated banana recipe');
        expect(results).toEqual([]);
      });

      it('returns an empty array when no sources have been added at all', async () => {
        const index = makeIndex(new FakeEmbedder());
        const results = await index.search('anything');
        expect(results).toEqual([]);
      });
    });

    describe('User Story 3 — Retrieve a Chunk or Document by Identifier', () => {
      it('returns the full text and metadata for a known chunk id', async () => {
        const index = makeIndex(new FakeEmbedder());
        const source = index.seedSource();
        const document = index.seedDocument(source.id);
        const chunk = index.seedChunk(document.id, { text: 'installation guide' });

        const fetched = await index.fetch(chunk.id);
        expect(fetched).toEqual(chunk);
      });

      it('returns the full text and metadata for a known document id', async () => {
        const index = makeIndex(new FakeEmbedder());
        const source = index.seedSource();
        const document = index.seedDocument(source.id);

        const fetched = await index.fetch(document.id);
        expect(fetched).toEqual(document);
      });

      it('rejects with NotFoundError for an unknown id, not an uncaught exception', async () => {
        const index = makeIndex(new FakeEmbedder());
        await expect(index.fetch('does-not-exist')).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe('User Story 4 — List Sources and Their Status', () => {
      it('lists sources with all required fields', async () => {
        const index = makeIndex(new FakeEmbedder());
        await index.addSource({ type: 'git', origin: 'https://example.com/repo.git' });

        const sources = await index.listSources();
        expect(sources).toHaveLength(1);
        expect(sources[0]).toMatchObject({
          type: 'git',
          origin: 'https://example.com/repo.git',
        });
        expect(['pending', 'indexing']).toContain(sources[0].status);
      });

      it('shows a seeded error-status source with a human-readable explanation', async () => {
        const index = makeIndex(new FakeEmbedder());
        index.seedSource({ status: 'error', error: 'crawl exceeded page-count bounds' });

        const sources = await index.listSources();
        expect(sources).toHaveLength(1);
        expect(sources[0].status).toBe('error');
        expect(sources[0].error).toBe('crawl exceeded page-count bounds');
      });

      it('never lists more than one entry for a resubmitted origin (SC-004, list-uniqueness half)', async () => {
        const index = makeIndex(new FakeEmbedder());
        await index.addSource({ type: 'url', origin: 'https://example.com/docs' });
        await index.addSource({ type: 'url', origin: 'https://example.com/docs' });

        const sources = await index.listSources();
        expect(sources.filter((s) => s.origin === 'https://example.com/docs')).toHaveLength(1);
      });
    });

    describe('Edge Cases', () => {
      it('a second addSource call for an already-indexed origin refreshes it rather than starting a concurrent second refresh', async () => {
        const index = makeIndex(new FakeEmbedder());
        const original = await index.addSource({ type: 'url', origin: 'https://example.com/docs' });

        const [a, b] = await Promise.all([
          index.addSource({ type: 'url', origin: 'https://example.com/docs' }),
          index.addSource({ type: 'url', origin: 'https://example.com/docs' }),
        ]);
        expect(a.id).toBe(original.id);
        expect(b.id).toBe(original.id);

        const sources = await index.listSources();
        expect(sources.filter((s) => s.origin === 'https://example.com/docs')).toHaveLength(1);
      });

      it('mixes vector and lexical results in one search over a partial-embedding-backlog corpus', async () => {
        const index = makeIndex(new FakeEmbedder());
        const source = index.seedSource();
        const document = index.seedDocument(source.id);
        index.seedChunk(document.id, { text: 'installation guide', embedding: [1, 0] });
        index.seedChunk(document.id, { text: 'installation troubleshooting', embedding: null });

        const results = await index.search('installation');
        expect(results).toHaveLength(2);
        const rankedByValues = results.map((r) => r.rankedBy).sort();
        expect(rankedByValues).toEqual(['lexical', 'vector']);
      });

      it('keeps a source in error status searchable for whatever it already indexed', async () => {
        const index = makeIndex(new FakeEmbedder());
        const source = index.seedSource({ status: 'error', error: 'crawl exceeded page-count bounds' });
        const document = index.seedDocument(source.id);
        index.seedChunk(document.id, { text: 'partially indexed content' });

        const results = await index.search('partially indexed content');
        expect(results).toHaveLength(1);

        const sources = await index.listSources();
        expect(sources[0].status).toBe('error');
      });

      it('returns a structured error, not a crash, when fetch is called with an id that never existed', async () => {
        const index = makeIndex(new FakeEmbedder());
        await expect(index.fetch('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });
  });
}

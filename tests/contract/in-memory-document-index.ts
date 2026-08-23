// Test double implementing DocumentIndex + Embedder in memory.
// Fleshed out incrementally per specs/001-core-interfaces-data-model/tasks.md
// (T007 skeleton, then T010/T012/T014/T016 per user story).

import { randomUUID } from 'node:crypto';
import type {
  AddSourceInput,
  SearchOptions,
} from '../../src/core/document-index.js';
import { NotFoundError } from '../../src/core/document-index.js';
import type { Embedder } from '../../src/core/embedder.js';
import type {
  Chunk,
  Document,
  RankedChunk,
  Source,
} from '../../src/core/types.js';
import type { TestableDocumentIndex } from './document-index.contract.js';

/** Embedder stand-in whose behavior a test controls directly. */
export class FakeEmbedder implements Embedder {
  constructor(private available = true) {}

  setAvailable(available: boolean): void {
    this.available = available;
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.available) return null;
    // Deterministic, content-derived "vector": good enough to let cosine-style
    // comparisons in search() distinguish relevant from irrelevant text
    // without needing a real embedding model.
    const lower = text.toLowerCase();
    return [lower.length, [...lower].filter((c) => c === ' ').length];
  }
}

interface SeedChunk {
  sourceId: string;
  documentUri: string;
  text: string;
}

export class InMemoryDocumentIndex implements TestableDocumentIndex {
  private sources = new Map<string, Source>();
  private originToId = new Map<string, string>();
  private documents = new Map<string, Document>();
  private chunks = new Map<string, Chunk>();

  constructor(private embedder: Embedder = new FakeEmbedder()) {}

  async addSource(input: AddSourceInput): Promise<Source> {
    const existingId = this.originToId.get(input.origin);
    if (existingId) {
      const existing = this.sources.get(existingId);
      if (existing) {
        const refreshed: Source = { ...existing, status: 'indexing' };
        this.sources.set(existingId, refreshed);
        return refreshed;
      }
    }

    const id = randomUUID();
    const source: Source = {
      id,
      type: input.type,
      origin: input.origin,
      addedAt: Date.now(),
      lastIndexedAt: null,
      status: 'pending',
      error: null,
    };
    this.sources.set(id, source);
    this.originToId.set(input.origin, id);
    return source;
  }

  async search(query: string, options?: SearchOptions): Promise<RankedChunk[]> {
    const limit = options?.limit ?? 10;
    const sourceIdFilter = options?.sourceId;
    const queryVector = await this.embedder.embed(query);
    const queryLower = query.toLowerCase();

    const results: RankedChunk[] = [];
    for (const chunk of this.chunks.values()) {
      const document = this.documents.get(chunk.documentId);
      if (!document) continue;
      const source = this.sources.get(document.sourceId);
      if (!source) continue;
      if (sourceIdFilter && source.id !== sourceIdFilter) continue;

      if (queryVector && chunk.embedding) {
        // Milestone 001's fake proves the contract shape and the
        // degrade-to-lexical path (FR-005), not ranking quality — real
        // similarity scoring belongs to the concrete embedder (milestone
        // 005). Any chunk with an embedding is a vector match here.
        results.push({ chunk, document, source, score: 1, rankedBy: 'vector' });
      } else if (queryLower.length > 0 && chunk.text.toLowerCase().includes(queryLower)) {
        results.push({ chunk, document, source, score: 1, rankedBy: 'lexical' });
      }
    }

    return results.slice(0, limit);
  }

  async fetch(id: string): Promise<Chunk | Document> {
    const chunk = this.chunks.get(id);
    if (chunk) return chunk;
    const document = this.documents.get(id);
    if (document) return document;
    throw new NotFoundError(id);
  }

  async listSources(): Promise<Source[]> {
    return [...this.sources.values()];
  }

  async removeSource(id: string): Promise<void> {
    const source = this.sources.get(id);
    if (!source) throw new NotFoundError(id);

    for (const [documentId, document] of this.documents) {
      if (document.sourceId !== id) continue;
      for (const [chunkId, chunk] of this.chunks) {
        if (chunk.documentId === documentId) this.chunks.delete(chunkId);
      }
      this.documents.delete(documentId);
    }

    this.sources.delete(id);
    this.originToId.delete(source.origin);
  }

  // --- Test-only seeding helpers (filled in by T012, T016) ---

  seedSource(overrides: Partial<Source> = {}): Source {
    const id = overrides.id ?? randomUUID();
    const source: Source = {
      id,
      type: overrides.type ?? 'url',
      origin: overrides.origin ?? `seed:${id}`,
      addedAt: overrides.addedAt ?? Date.now(),
      lastIndexedAt: overrides.lastIndexedAt ?? Date.now(),
      status: overrides.status ?? 'ready',
      error: overrides.error ?? null,
    };
    this.sources.set(id, source);
    this.originToId.set(source.origin, id);
    return source;
  }

  seedDocument(sourceId: string, overrides: Partial<Document> = {}): Document {
    const id = overrides.id ?? randomUUID();
    const document: Document = {
      id,
      sourceId,
      uri: overrides.uri ?? `/seed-doc-${id}`,
      title: overrides.title ?? null,
      contentHash: overrides.contentHash ?? 'seed-hash',
      fetchedAt: overrides.fetchedAt ?? Date.now(),
    };
    this.documents.set(id, document);
    return document;
  }

  seedChunk(documentId: string, overrides: Partial<Chunk> = {}): Chunk {
    const id = overrides.id ?? randomUUID();
    const text = overrides.text ?? '';
    const chunk: Chunk = {
      id,
      documentId,
      ordinal: overrides.ordinal ?? 0,
      text,
      embedding: overrides.embedding ?? null,
      tokenCount: overrides.tokenCount ?? text.split(/\s+/).filter(Boolean).length,
    };
    this.chunks.set(id, chunk);
    return chunk;
  }
}

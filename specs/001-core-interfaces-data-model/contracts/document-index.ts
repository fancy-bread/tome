// Contract defining the four operations every DocumentIndex implementation
// must support. See spec.md FR-001 through FR-011.
//
// Callers depend on this interface only — never on a concrete
// implementation's internals (Constitution Principle IV). SC-003 requires
// this contract to be implementable by a second backend without changing
// callers; tests/contract/document-index.contract.ts is the
// executable proof of that, run first against an in-memory fake (this
// feature) and later against SqliteDocumentIndex (milestone 003).

import type { Chunk, Document, RankedChunk, Source, SourceType } from './types';

/**
 * Thrown by `fetch` when no chunk or document matches the given id. A
 * typed, documented rejection — not an unhandled crash (FR-008).
 */
export class NotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No chunk or document found for id: ${id}`);
    this.name = 'NotFoundError';
  }
}

export interface AddSourceInput {
  type: SourceType;
  origin: string;
}

export interface SearchOptions {
  limit?: number;
  sourceId?: string;
}

export interface DocumentIndex {
  /**
   * Registers a source and returns immediately with a `pending` or
   * `indexing` Source — it does not wait for crawling or embedding to
   * finish (FR-001). Calling this again with an `origin` that already
   * exists refreshes that source rather than creating a duplicate
   * (FR-003); a refresh already in progress absorbs a second call for the
   * same origin rather than starting a concurrent one.
   */
  addSource(input: AddSourceInput): Promise<Source>;

  /**
   * Returns ranked chunks matching `query`. Falls back to lexical ranking
   * when semantic ranking is unavailable rather than failing the request
   * (FR-004, FR-005); returns an empty array, never an error, when
   * nothing matches or no sources have been added (FR-006).
   */
  search(query: string, options?: SearchOptions): Promise<RankedChunk[]>;

  /**
   * Returns the full chunk or document for `id`. Rejects with
   * `NotFoundError` — not an unhandled exception — when `id` matches
   * nothing (FR-008).
   */
  fetch(id: string): Promise<Chunk | Document>;

  /**
   * Lists every added source with its type, origin, status, and
   * last-indexed timestamp (FR-009).
   */
  listSources(): Promise<Source[]>;
}

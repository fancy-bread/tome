// Contract for turning a Source into raw, text-bearing Documents.
// See specs/002-ingestion-pipeline/spec.md FR-001 through FR-008, FR-012,
// FR-013, and data-model.md for field-level rationale.
//
// This contract must not import from src/storage/ or any embedding
// module (Constitution Principle IV) — a Crawler is usable standalone,
// as proven by tests/ingestion/*.test.ts running it with no
// DocumentIndex or Embedder present.

import type { Document, SourceType } from '../../../src/core/types.js';

export interface CrawlBounds {
  /** Default 3. Depth 0 is the starting page; each hop adds 1. */
  maxDepth: number;
  /** Default 200. Total documents fetched across the whole crawl. */
  maxPageCount: number;
}

export interface CrawlInput {
  type: SourceType;
  origin: string;
  /**
   * The Source this crawl is for — stamped onto every Document produced
   * (Document.sourceId, per milestone 001, is required). The caller
   * creates the Source (e.g. via DocumentIndex.addSource) before
   * crawling and passes its id here; the crawler itself never creates
   * or knows about Source records beyond this id.
   */
  sourceId: string;
  /** Only consulted when type === 'url'; ignored otherwise. */
  bounds?: Partial<CrawlBounds>;
}

export interface CrawledDocument {
  document: Document;
  /**
   * Raw extracted text, handed to the Chunker. Never persisted itself —
   * Document (per milestone 001) has no text field; Chunks are the only
   * durable text-bearing unit.
   */
  text: string;
}

export interface CrawlResult {
  /** Everything successfully fetched/parsed, including partial results
   * from a bounded or partially-failed crawl (FR-003, FR-007). */
  documents: CrawledDocument[];
  /**
   * Set only for a source-level failure (unreachable start URL,
   * unclonable repo — FR-008); null on full or partial success.
   * error !== null implies documents is empty.
   */
  error: string | null;
}

export interface Crawler {
  crawl(input: CrawlInput): Promise<CrawlResult>;
}

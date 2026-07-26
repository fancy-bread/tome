// Contract for splitting a Document's raw text into overlapping Chunks.
// See specs/002-ingestion-pipeline/spec.md FR-009 through FR-011.
//
// This contract must not import from src/storage/ or any embedding
// module (Constitution Principle IV) — a Chunker is usable standalone,
// consuming only the text handed to it, with no DocumentIndex or
// Embedder present.

import type { Chunk } from '../../../src/core/types.js';

export interface Chunker {
  /**
   * Splits `text` into overlapping Chunks belonging to `documentId`,
   * preferring header/paragraph boundaries over mid-sentence or
   * mid-code-block splits (FR-009). Ordinals are stable across repeated
   * calls with unchanged text (FR-010). Returns exactly one chunk for
   * text shorter than the target chunk size, and [] for empty text
   * (FR-011). Every returned chunk's `embedding` is null — assigning it
   * is milestone 005's job.
   */
  chunk(documentId: string, text: string): Chunk[];
}

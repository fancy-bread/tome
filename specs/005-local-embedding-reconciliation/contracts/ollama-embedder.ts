// Contract for the concrete v1 Embedder implementation.
// See specs/005-local-embedding-reconciliation/spec.md FR-001, FR-002,
// FR-011, and research.md #1-#2 for the HTTP shape and failure-handling
// decisions.
//
// OllamaEmbedder implements the already-defined Embedder interface
// (milestone 001, src/core/embedder.ts) with no changes to it.

import type { Embedder } from '../../../src/core/embedder.js';

export interface OllamaEmbedderOptions {
  /**
   * Base URL of the local Ollama instance. Defaults to Ollama's own
   * default listen address. Not read from an environment variable or
   * exposed as user-facing configuration in v1 (Constitution Principle
   * V) — the only reason this is a constructor option at all is so
   * tests can point it at a local test server instead (research.md #1,
   * matching DefaultCrawler's URL-source tests).
   */
  baseUrl?: string; // default: 'http://localhost:11434'
  /**
   * Embedding model name, sent as-is in the request body. Defaults to
   * the model named in the constitution's Technology Constraints
   * section. Not user-configurable in v1.
   */
  model?: string; // default: 'nomic-embed-text'
}

export declare class OllamaEmbedder implements Embedder {
  constructor(options?: OllamaEmbedderOptions);

  /**
   * Calls Ollama's embeddings endpoint for `text` and returns the
   * resulting vector. Returns `null` — never throws — for every failure
   * mode: the service unreachable, a non-2xx response, an unparseable
   * body, a body missing `embedding`, or an `embedding` whose length
   * doesn't match the fixed 768-dimension `chunk_vectors` column
   * (research.md #2). A `null` return is this contract's only signal
   * that the embedding is unavailable right now — callers (runIndexingJob,
   * reconciliation, search()) already treat `null` as "fall back to
   * lexical," per the existing Embedder contract.
   */
  embed(text: string): Promise<number[] | null>;
}

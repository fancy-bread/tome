// Contract for the concrete v1 DocumentIndex implementation.
// See specs/003-sqlite-document-index/spec.md FR-001 through FR-016.
//
// SqliteDocumentIndex implements the already-defined DocumentIndex
// interface (milestone 001) with no changes to it. What's new here is
// the concrete class's own constructor shape — what a caller (eventually
// milestone 004's MCP server) needs to provide to construct one — and
// the TestableDocumentIndex seed methods it must also implement so
// milestone 001's contract-test suite can run against it unmodified
// (FR-016/SC-003).

import type { DocumentIndex } from '../../../src/core/document-index.js';
import type { Embedder } from '../../../src/core/embedder.js';
// TestableDocumentIndex lives in src/, not tests/ — a src/ class
// implementing it must not depend on tests/ (breaks the production
// build's rootDir constraint; discovered during implementation, see
// research.md).
import type { TestableDocumentIndex } from '../../../src/core/testable-document-index.js';

export interface SqliteDocumentIndexOptions {
  /**
   * Path to the SQLite file, or ':memory:' for an isolated in-memory
   * database. Production callers pass a real file path (the plugin's
   * durable data directory, per the constitution); tests use ':memory:'
   * except the one test proving cross-restart persistence (SC-002),
   * which needs a real temp file.
   */
  dbPath: string;
  /**
   * Injected per Constitution Principle IV — this milestone doesn't
   * require a functional embedder to meet its own requirements, but the
   * dependency must already be wired the way milestone 005's real
   * OllamaEmbedder will be, so that swap-in is additive, not a rewrite.
   */
  embedder: Embedder;
}

export declare class SqliteDocumentIndex implements DocumentIndex, TestableDocumentIndex {
  constructor(options: SqliteDocumentIndexOptions);

  /** Closes the underlying SQLite connection. Not part of DocumentIndex — callers that need to reopen against the same file (as in SC-002's test) must call this first. */
  close(): void;
}

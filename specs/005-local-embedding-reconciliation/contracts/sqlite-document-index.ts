// Contract diff for SqliteDocumentIndex — one new constructor option and
// two new lifecycle behaviors. See
// specs/003-sqlite-document-index/contracts/sqlite-document-index.ts for
// the full pre-existing contract (unchanged except as noted below) and
// specs/005-local-embedding-reconciliation/research.md #4 and #6 for the
// rationale behind what's added here.

import type { DocumentIndex } from '../../../src/core/document-index.js';
import type { Embedder } from '../../../src/core/embedder.js';
import type { TestableDocumentIndex } from '../../../src/core/testable-document-index.js';

export interface SqliteDocumentIndexOptions {
  dbPath: string;
  embedder: Embedder;
  /**
   * New in this milestone. How often the background reconciliation pass
   * (research.md #4) re-scans for chunks missing an embedding. Defaults
   * to a fixed production value. This is a test seam, not user-facing
   * configuration (Constitution Principle V) — tests pass a very small
   * value to observe a recurring pass without waiting on a real
   * production-length interval; nothing reads this from an environment
   * variable.
   */
  reconciliationIntervalMs?: number;
}

export declare class SqliteDocumentIndex implements DocumentIndex, TestableDocumentIndex {
  constructor(options: SqliteDocumentIndexOptions);

  // --- Behavior changes, not new public methods ---

  // On construction: fires one reconciliation pass immediately
  // (fire-and-forget, satisfying FR-006's startup pass), then starts a
  // recurring pass on `reconciliationIntervalMs` (FR-005). Neither pass
  // is exposed as a public method — reconciliation is entirely internal,
  // per research.md #4's interface-segregation rationale.

  // runIndexingJob (private, unchanged signature) now calls
  // `this.embedder.embed(chunk.text)` for each chunk before persisting
  // it, in both the new-document and changed-document branches
  // (research.md #3). No change to this class's public surface.

  close(): void;
  // Now also clears the reconciliation interval timer, so no caller
  // (test or production shutdown) leaks a background timer by calling
  // this — the same lifecycle guarantee `close()` already gave the
  // underlying `better-sqlite3` connection.
}

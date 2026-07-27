import { runDocumentIndexContractTests } from '../contract/document-index.contract.js';
import { SqliteDocumentIndex } from '../../src/storage/sqlite-document-index.js';

// FR-016/SC-003: the exact same suite from milestone 001, imported
// unmodified, run against a real SQLite-backed implementation.
runDocumentIndexContractTests((embedder) => new SqliteDocumentIndex({ dbPath: ':memory:', embedder }));

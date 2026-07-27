// Test-only extension of DocumentIndex, used by
// tests/contract/document-index.contract.ts's shared suite (introduced
// during milestone 001's /speckit-analyze remediation) and implemented
// by any concrete DocumentIndex that wants to reuse that suite —
// InMemoryDocumentIndex (milestone 001) and SqliteDocumentIndex
// (milestone 003) both do.
//
// Lives in src/, not tests/, so that a concrete implementation under
// src/ (e.g. src/storage/sqlite-document-index.ts) can implement it
// without src/ needing to import from tests/ — which broke
// tsconfig.build.json's rootDir constraint when it did (discovered
// during milestone 003's implementation).

import type { Chunk, Document, Source } from './types.js';
import type { DocumentIndex } from './document-index.js';

export interface DocumentIndexTestSeed {
  seedSource(overrides?: Partial<Source>): Source;
  seedDocument(sourceId: string, overrides?: Partial<Document>): Document;
  seedChunk(documentId: string, overrides?: Partial<Chunk>): Chunk;
}

export type TestableDocumentIndex = DocumentIndex & DocumentIndexTestSeed;

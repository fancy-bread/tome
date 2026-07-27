import type { DocumentIndex } from '../../src/core/document-index.js';
import type { Embedder } from '../../src/core/embedder.js';
import type { Chunk, Document, Source } from '../../src/core/types.js';
export interface DocumentIndexTestSeed {
    seedSource(overrides?: Partial<Source>): Source;
    seedDocument(sourceId: string, overrides?: Partial<Document>): Document;
    seedChunk(documentId: string, overrides?: Partial<Chunk>): Chunk;
}
export type TestableDocumentIndex = DocumentIndex & DocumentIndexTestSeed;
export declare function runDocumentIndexContractTests(makeIndex: (embedder: Embedder) => TestableDocumentIndex): void;

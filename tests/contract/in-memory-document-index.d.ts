import type { AddSourceInput, SearchOptions } from '../../src/core/document-index.js';
import type { Embedder } from '../../src/core/embedder.js';
import type { Chunk, Document, RankedChunk, Source } from '../../src/core/types.js';
import type { TestableDocumentIndex } from './document-index.contract.js';
/** Embedder stand-in whose behavior a test controls directly. */
export declare class FakeEmbedder implements Embedder {
    private available;
    constructor(available?: boolean);
    setAvailable(available: boolean): void;
    embed(text: string): Promise<number[] | null>;
}
export declare class InMemoryDocumentIndex implements TestableDocumentIndex {
    private embedder;
    private sources;
    private originToId;
    private documents;
    private chunks;
    constructor(embedder?: Embedder);
    addSource(input: AddSourceInput): Promise<Source>;
    search(query: string, options?: SearchOptions): Promise<RankedChunk[]>;
    fetch(id: string): Promise<Chunk | Document>;
    listSources(): Promise<Source[]>;
    seedSource(overrides?: Partial<Source>): Source;
    seedDocument(sourceId: string, overrides?: Partial<Document>): Document;
    seedChunk(documentId: string, overrides?: Partial<Chunk>): Chunk;
}

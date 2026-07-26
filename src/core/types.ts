// Core data model for Tome's document index.
// See specs/001-core-interfaces-data-model/data-model.md for field-level
// rationale and validation rules.

export type SourceType = 'url' | 'path' | 'git';

export type SourceStatus = 'pending' | 'indexing' | 'ready' | 'error';

export interface Source {
  id: string;
  type: SourceType;
  origin: string;
  addedAt: number;
  lastIndexedAt: number | null;
  status: SourceStatus;
  error: string | null;
}

export interface Document {
  id: string;
  sourceId: string;
  uri: string;
  title: string | null;
  contentHash: string;
  fetchedAt: number;
}

export interface Chunk {
  id: string;
  documentId: string;
  ordinal: number;
  text: string;
  embedding: number[] | null;
  tokenCount: number;
}

export type RankedBy = 'vector' | 'lexical';

export interface RankedChunk {
  chunk: Chunk;
  document: Document;
  source: Source;
  score: number;
  rankedBy: RankedBy;
}

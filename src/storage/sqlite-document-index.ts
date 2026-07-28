// Concrete v1 DocumentIndex implementation. See
// specs/003-sqlite-document-index/spec.md FR-001 through FR-016 and
// specs/003-sqlite-document-index/contracts/sqlite-document-index.ts.

import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  AddSourceInput,
  SearchOptions,
} from '../core/document-index.js';
import { NotFoundError } from '../core/document-index.js';
import type { Embedder } from '../core/embedder.js';
import type {
  Chunk,
  Document,
  RankedChunk,
  Source,
  SourceStatus,
  SourceType,
} from '../core/types.js';
import { DefaultChunker } from '../ingestion/chunker.js';
import { DefaultCrawler } from '../ingestion/crawler.js';
import { applySchema } from './schema.js';
import { sanitizeFtsQuery } from './fts-query.js';
import { decodeEmbedding, encodeEmbedding } from './vector-codec.js';
import type { TestableDocumentIndex } from '../core/testable-document-index.js';

const DEFAULT_RECONCILIATION_INTERVAL_MS = 30_000;

export interface SqliteDocumentIndexOptions {
  dbPath: string;
  embedder: Embedder;
  /**
   * How often the background reconciliation pass re-scans for chunks
   * missing an embedding (FR-005). A test seam, not user-facing
   * configuration (Constitution Principle V) — production always uses
   * the default; tests pass a small value to observe a recurring pass
   * quickly.
   */
  reconciliationIntervalMs?: number;
}

interface SourceRow {
  id: string;
  type: SourceType;
  origin: string;
  added_at: number;
  last_indexed_at: number | null;
  status: SourceStatus;
  error: string | null;
}

interface DocumentRow {
  id: string;
  source_id: string;
  uri: string;
  title: string | null;
  content_hash: string;
  fetched_at: number;
}

interface ChunkRow {
  rowid: number;
  id: string;
  document_id: string;
  ordinal: number;
  text: string;
  token_count: number;
}

function sourceFromRow(row: SourceRow): Source {
  return {
    id: row.id,
    type: row.type,
    origin: row.origin,
    addedAt: row.added_at,
    lastIndexedAt: row.last_indexed_at,
    status: row.status,
    error: row.error,
  };
}

function documentFromRow(row: DocumentRow): Document {
  return {
    id: row.id,
    sourceId: row.source_id,
    uri: row.uri,
    title: row.title,
    contentHash: row.content_hash,
    fetchedAt: row.fetched_at,
  };
}

export class SqliteDocumentIndex implements TestableDocumentIndex {
  private db: Database.Database;
  private embedder: Embedder;
  private crawler = new DefaultCrawler();
  private chunker = new DefaultChunker();
  private inFlightJobs = new Map<string, Promise<void>>();
  private reconciling = false;
  private reconciliationTimer: NodeJS.Timeout;

  constructor(options: SqliteDocumentIndexOptions) {
    this.db = new Database(options.dbPath);
    applySchema(this.db);
    this.embedder = options.embedder;

    const intervalMs = options.reconciliationIntervalMs ?? DEFAULT_RECONCILIATION_INTERVAL_MS;
    void this.reconcileNullEmbeddings();
    this.reconciliationTimer = setInterval(() => void this.reconcileNullEmbeddings(), intervalMs);
  }

  close(): void {
    clearInterval(this.reconciliationTimer);
    this.db.close();
  }

  /**
   * Finds every chunk with no matching `chunk_vectors` row (the same
   * "no vector row = null embedding" rule chunkFromRow already reads by)
   * and re-attempts embedding for each. Guarded by `reconciling` so an
   * overlapping timer tick is a no-op rather than a concurrent second
   * pass (FR-010) — skip, don't queue. Never throws: a failed
   * re-attempt just leaves the chunk null and eligible for the next
   * pass (FR-008).
   */
  private async reconcileNullEmbeddings(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const rows = this.db
        .prepare(
          `SELECT chunks.rowid as rowid, chunks.id as id, chunks.text as text
           FROM chunks
           LEFT JOIN chunk_vectors ON chunk_vectors.rowid = chunks.rowid
           WHERE chunk_vectors.rowid IS NULL`,
        )
        .all() as Array<{ rowid: number; id: string; text: string }>;

      for (const row of rows) {
        const embedding = await this.embedder.embed(row.text);
        if (embedding) {
          this.db
            .prepare('INSERT INTO chunk_vectors(rowid, embedding) VALUES (?, ?)')
            .run(BigInt(row.rowid), encodeEmbedding(embedding));
        }
      }
    } catch {
      // The connection may already be closed (e.g. close() was called
      // while a slow embed() call from this pass was still in flight).
      // Nothing meaningful to do at that point, but this must not become
      // an unhandled rejection on a promise nothing awaits — the same
      // reasoning as runIndexingJob's own closed-connection guard.
    } finally {
      this.reconciling = false;
    }
  }

  // --- Row/entity lookups, shared by seed methods, orchestration, fetch, and search ---

  private getSourceById(id: string): Source | undefined {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined;
    return row ? sourceFromRow(row) : undefined;
  }

  private getSourceByOrigin(origin: string): Source | undefined {
    const row = this.db.prepare('SELECT * FROM sources WHERE origin = ?').get(origin) as
      | SourceRow
      | undefined;
    return row ? sourceFromRow(row) : undefined;
  }

  private getDocumentById(id: string): Document | undefined {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
      | DocumentRow
      | undefined;
    return row ? documentFromRow(row) : undefined;
  }

  private getDocumentByUri(sourceId: string, uri: string): Document | undefined {
    const row = this.db
      .prepare('SELECT * FROM documents WHERE source_id = ? AND uri = ?')
      .get(sourceId, uri) as DocumentRow | undefined;
    return row ? documentFromRow(row) : undefined;
  }

  private getChunkById(id: string): Chunk | undefined {
    const row = this.db
      .prepare('SELECT rowid, id, document_id, ordinal, text, token_count FROM chunks WHERE id = ?')
      .get(id) as ChunkRow | undefined;
    if (!row) return undefined;
    return this.chunkFromRow(row);
  }

  private chunkFromRow(row: ChunkRow): Chunk {
    const vecRow = this.db
      .prepare('SELECT embedding FROM chunk_vectors WHERE rowid = ?')
      .get(row.rowid) as { embedding: Buffer } | undefined;
    return {
      id: row.id,
      documentId: row.document_id,
      ordinal: row.ordinal,
      text: row.text,
      embedding: vecRow ? decodeEmbedding(vecRow.embedding) : null,
      tokenCount: row.token_count,
    };
  }

  /** Inserts a chunk row and, if it has an embedding, a matching chunk_vectors row. */
  private insertChunk(chunk: Chunk): void {
    const info = this.db
      .prepare(
        'INSERT INTO chunks (id, document_id, ordinal, text, token_count) VALUES (?, ?, ?, ?, ?)',
      )
      .run(chunk.id, chunk.documentId, chunk.ordinal, chunk.text, chunk.tokenCount);
    if (chunk.embedding) {
      this.db
        .prepare('INSERT INTO chunk_vectors(rowid, embedding) VALUES (?, ?)')
        .run(BigInt(info.lastInsertRowid), encodeEmbedding(chunk.embedding));
    }
  }

  /**
   * Deletes every chunk belonging to `documentId`, used when a refresh
   * replaces a changed document's chunks (FR-014). `chunk_text_fts` is
   * kept in sync automatically by schema.ts's DELETE trigger, but
   * `chunk_vectors` has no such trigger — its rows must be deleted
   * explicitly here, or SQLite reusing a deleted chunk's rowid for an
   * unrelated future chunk would silently inherit its old embedding.
   */
  private deleteChunksForDocument(documentId: string): void {
    const rowids = this.db
      .prepare('SELECT rowid FROM chunks WHERE document_id = ?')
      .all(documentId) as Array<{ rowid: number }>;
    const deleteVector = this.db.prepare('DELETE FROM chunk_vectors WHERE rowid = ?');
    for (const { rowid } of rowids) {
      deleteVector.run(BigInt(rowid));
    }
    this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
  }

  // --- TestableDocumentIndex (test-only seed methods) ---

  seedSource(overrides: Partial<Source> = {}): Source {
    const source: Source = {
      id: overrides.id ?? randomUUID(),
      type: overrides.type ?? 'url',
      origin: overrides.origin ?? `seed:${randomUUID()}`,
      addedAt: overrides.addedAt ?? Date.now(),
      lastIndexedAt: overrides.lastIndexedAt ?? Date.now(),
      status: overrides.status ?? 'ready',
      error: overrides.error ?? null,
    };
    this.db
      .prepare(
        'INSERT INTO sources (id, type, origin, added_at, last_indexed_at, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(source.id, source.type, source.origin, source.addedAt, source.lastIndexedAt, source.status, source.error);
    return source;
  }

  seedDocument(sourceId: string, overrides: Partial<Document> = {}): Document {
    const id = overrides.id ?? randomUUID();
    const document: Document = {
      id,
      sourceId,
      uri: overrides.uri ?? `/seed-doc-${id}`,
      title: overrides.title ?? null,
      contentHash: overrides.contentHash ?? 'seed-hash',
      fetchedAt: overrides.fetchedAt ?? Date.now(),
    };
    this.db
      .prepare(
        'INSERT INTO documents (id, source_id, uri, title, content_hash, fetched_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(document.id, document.sourceId, document.uri, document.title, document.contentHash, document.fetchedAt);
    return document;
  }

  seedChunk(documentId: string, overrides: Partial<Chunk> = {}): Chunk {
    const id = overrides.id ?? randomUUID();
    const text = overrides.text ?? '';
    const chunk: Chunk = {
      id,
      documentId,
      ordinal: overrides.ordinal ?? 0,
      text,
      embedding: overrides.embedding ?? null,
      tokenCount: overrides.tokenCount ?? text.split(/\s+/).filter(Boolean).length,
    };
    this.insertChunk(chunk);
    return chunk;
  }

  // --- DocumentIndex ---

  async addSource(input: AddSourceInput): Promise<Source> {
    const existing = this.getSourceByOrigin(input.origin);
    let source: Source;

    if (existing) {
      source = { ...existing, status: 'indexing' };
      this.db.prepare('UPDATE sources SET status = ? WHERE id = ?').run('indexing', source.id);
    } else {
      source = {
        id: randomUUID(),
        type: input.type,
        origin: input.origin,
        addedAt: Date.now(),
        lastIndexedAt: null,
        status: 'pending',
        error: null,
      };
      this.db
        .prepare(
          'INSERT INTO sources (id, type, origin, added_at, last_indexed_at, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(source.id, source.type, source.origin, source.addedAt, source.lastIndexedAt, source.status, source.error);
    }

    if (!this.inFlightJobs.has(source.id)) {
      const job = this.runIndexingJob(source).finally(() => {
        this.inFlightJobs.delete(source.id);
      });
      this.inFlightJobs.set(source.id, job);
    }

    return source;
  }

  /**
   * Crawls and chunks `source`, persisting the results. On refresh, a
   * document whose content hash matches what's already stored is left
   * untouched (FR-013); a document whose hash differs keeps its existing
   * id but gets its chunks replaced (FR-014); a genuinely new document
   * is inserted. `(sourceId, uri)` is the natural key across crawls,
   * since the crawler regenerates `Document.id` every call (research.md).
   * Never rejects: any failure is recorded as `status: 'error'`
   * (Constitution Principle II) rather than propagating as an unhandled
   * rejection, since nothing awaits this promise directly (addSource
   * fires it without awaiting, per FR-002).
   */
  private async runIndexingJob(source: Source): Promise<void> {
    try {
      const crawlResult = await this.crawler.crawl({
        type: source.type,
        origin: source.origin,
        sourceId: source.id,
      });

      if (crawlResult.error) {
        this.db
          .prepare('UPDATE sources SET status = ?, error = ? WHERE id = ?')
          .run('error', crawlResult.error, source.id);
        return;
      }

      for (const crawled of crawlResult.documents) {
        const existing = this.getDocumentByUri(source.id, crawled.document.uri);

        if (existing && existing.contentHash === crawled.document.contentHash) {
          continue; // unchanged since last index — skip entirely (FR-013)
        }

        if (existing) {
          // Changed — same Document.id, refreshed metadata, replaced chunks (FR-014).
          this.db
            .prepare('UPDATE documents SET title = ?, content_hash = ?, fetched_at = ? WHERE id = ?')
            .run(
              crawled.document.title,
              crawled.document.contentHash,
              crawled.document.fetchedAt,
              existing.id,
            );
          this.deleteChunksForDocument(existing.id);
          for (const chunk of this.chunker.chunk(existing.id, crawled.text)) {
            chunk.embedding = await this.embedder.embed(chunk.text);
            this.insertChunk(chunk);
          }
        } else {
          // New — insert as-is using the id the crawler generated for it.
          this.db
            .prepare(
              'INSERT INTO documents (id, source_id, uri, title, content_hash, fetched_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(
              crawled.document.id,
              crawled.document.sourceId,
              crawled.document.uri,
              crawled.document.title,
              crawled.document.contentHash,
              crawled.document.fetchedAt,
            );
          for (const chunk of this.chunker.chunk(crawled.document.id, crawled.text)) {
            chunk.embedding = await this.embedder.embed(chunk.text);
            this.insertChunk(chunk);
          }
        }
      }

      this.db
        .prepare('UPDATE sources SET status = ?, last_indexed_at = ? WHERE id = ?')
        .run('ready', Date.now(), source.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        this.db.prepare('UPDATE sources SET status = ?, error = ? WHERE id = ?').run('error', message, source.id);
      } catch {
        // The connection may already be closed (e.g. the caller tore
        // down the index before this background job finished). Nothing
        // meaningful to record at that point, but this must not become
        // a second unhandled rejection on top of the first failure —
        // that would defeat the entire point of the outer try/catch.
      }
    }
  }

  async search(query: string, options?: SearchOptions): Promise<RankedChunk[]> {
    const limit = options?.limit ?? 10;
    const sourceIdFilter = options?.sourceId ?? null;
    const ftsQuery = sanitizeFtsQuery(query);
    if (ftsQuery === null) return [];

    const queryVector = await this.embedder.embed(query);
    const results: RankedChunk[] = [];
    const matchedChunkIds = new Set<string>();

    if (queryVector) {
      const vectorRows = this.db
        .prepare(
          `SELECT chunks.id as chunk_id, documents.source_id, distance
           FROM chunk_vectors
           JOIN chunks ON chunks.rowid = chunk_vectors.rowid
           JOIN documents ON documents.id = chunks.document_id
           WHERE chunk_vectors.embedding MATCH ? AND k = ?
             AND (? IS NULL OR documents.source_id = ?)
           ORDER BY distance`,
        )
        .all(encodeEmbedding(queryVector), limit, sourceIdFilter, sourceIdFilter) as Array<{
        chunk_id: string;
        source_id: string;
        distance: number;
      }>;

      for (const row of vectorRows) {
        results.push(this.buildRankedChunk(row.chunk_id, -row.distance, 'vector'));
        matchedChunkIds.add(row.chunk_id);
      }
    }

    // Chunks with no embedding always fall to lexical; when no query
    // vector is available, every chunk does (mirrors InMemoryDocumentIndex).
    const excludeVectorMatched = queryVector
      ? 'AND chunks.rowid NOT IN (SELECT rowid FROM chunk_vectors)'
      : '';
    const lexicalRows = this.db
      .prepare(
        `SELECT chunks.id as chunk_id, documents.source_id, bm25(chunk_text_fts) as bm25_score
         FROM chunk_text_fts
         JOIN chunks ON chunks.rowid = chunk_text_fts.rowid
         JOIN documents ON documents.id = chunks.document_id
         WHERE chunk_text_fts MATCH ?
           AND (? IS NULL OR documents.source_id = ?)
           ${excludeVectorMatched}
         ORDER BY bm25_score
         LIMIT ?`,
      )
      .all(ftsQuery, sourceIdFilter, sourceIdFilter, limit) as Array<{
      chunk_id: string;
      source_id: string;
      bm25_score: number;
    }>;

    for (const row of lexicalRows) {
      if (matchedChunkIds.has(row.chunk_id)) continue;
      results.push(this.buildRankedChunk(row.chunk_id, -row.bm25_score, 'lexical'));
    }

    return results.slice(0, limit);
  }

  /**
   * chunk/document/source are all guaranteed present here: every row
   * comes from a query joined against `chunks`, and this class never
   * inserts a chunk before its document or a document before its source
   * (see addSource/runIndexingJob) — the `!` assertions reflect that
   * invariant rather than guessing it away.
   */
  private buildRankedChunk(chunkId: string, score: number, rankedBy: 'vector' | 'lexical'): RankedChunk {
    const chunk = this.getChunkById(chunkId)!;
    const document = this.getDocumentById(chunk.documentId)!;
    const source = this.getSourceById(document.sourceId)!;
    return { chunk, document, source, score, rankedBy };
  }

  async fetch(id: string): Promise<Chunk | Document> {
    const chunk = this.getChunkById(id);
    if (chunk) return chunk;
    const document = this.getDocumentById(id);
    if (document) return document;
    throw new NotFoundError(id);
  }

  async listSources(): Promise<Source[]> {
    const rows = this.db.prepare('SELECT * FROM sources').all() as SourceRow[];
    return rows.map(sourceFromRow);
  }
}

# Phase 1 Data Model: SQLite Document Index

No new TypeScript types — `Source`, `Document`, `Chunk`, `RankedChunk`
are unchanged from milestone 001. This is the SQL schema that persists
the first three of them, per `tdd.md`'s already-drafted design.

## `sources`

| Column | Type | Maps to |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | `Source.id` |
| `type` | `TEXT NOT NULL CHECK(type IN ('url','path','git'))` | `Source.type` |
| `origin` | `TEXT NOT NULL` | `Source.origin` — unique per source, enforced at the application layer (FR-012's refresh-not-duplicate), not a SQL `UNIQUE` constraint, since a `UNIQUE` violation would surface as a thrown SQLite error rather than the graceful refresh path FR-012 requires |
| `added_at` | `INTEGER NOT NULL` | `Source.addedAt` |
| `last_indexed_at` | `INTEGER` (nullable) | `Source.lastIndexedAt` |
| `status` | `TEXT NOT NULL CHECK(status IN ('pending','indexing','ready','error'))` | `Source.status` |
| `error` | `TEXT` (nullable) | `Source.error` |

## `documents`

| Column | Type | Maps to |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | `Document.id` |
| `source_id` | `TEXT NOT NULL REFERENCES sources(id)` | `Document.sourceId` |
| `uri` | `TEXT NOT NULL` | `Document.uri` — combined with `source_id`, this is the natural key for matching across refreshes (see research.md) |
| `title` | `TEXT` (nullable) | `Document.title` |
| `content_hash` | `TEXT NOT NULL` | `Document.contentHash` — compared on refresh to decide skip-vs-replace (FR-013/014) |
| `fetched_at` | `INTEGER NOT NULL` | `Document.fetchedAt` |

## `chunks`

| Column | Type | Maps to |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | `Chunk.id` |
| `document_id` | `TEXT NOT NULL REFERENCES documents(id)` | `Chunk.documentId` |
| `ordinal` | `INTEGER NOT NULL` | `Chunk.ordinal` |
| `text` | `TEXT NOT NULL` | `Chunk.text` |
| `token_count` | `INTEGER NOT NULL` | `Chunk.tokenCount` |

`Chunk.embedding` has no column here — presence/absence of a matching
row in `chunk_vectors` (below) is what null-vs-populated means. Every
chunk this milestone writes has no `chunk_vectors` row at all, which
`search()` treats identically to "embedding is null" (FTS5-only ranking).

## `chunk_vectors` (schema only this milestone)

```sql
CREATE VIRTUAL TABLE chunk_vectors USING vec0(
  embedding float[768]
);
```

Created on open; never inserted into or queried in this milestone.
Milestone 005 is what starts writing to it once a real `Embedder` exists.
768 dimensions matches `nomic-embed-text`, per the constitution.

## `chunk_text_fts`

```sql
CREATE VIRTUAL TABLE chunk_text_fts USING fts5(
  text, content='chunks', content_rowid='rowid'
);
```

An external-content FTS5 table over `chunks.text` — kept in sync via
triggers (insert/update/delete on `chunks` mirrors into
`chunk_text_fts`), so callers never populate it directly.

## Relationships

```
sources (1) ──< documents (1) ──< chunks
                                        │
                                        ├──> chunk_text_fts   (always populated)
                                        └──> chunk_vectors    (never populated this milestone)
```

## Runtime-only state (not persisted)

- **In-flight job tracker**: `Map<sourceId, Promise<void>>`, held by the
  `SqliteDocumentIndex` instance itself. Cleared once a job settles.
  Purely a same-process concurrency guard (FR-015) — has no on-disk
  representation and doesn't survive a restart, which is fine since a
  restart means no jobs were in flight to protect anyway.

# Phase 1 Data Model: Remove a Source

No new types, no schema changes. `Source`, `Document`, `Chunk` (milestone
001) and the `sources`/`documents`/`chunks`/`chunk_vectors`/
`chunk_text_fts` tables (milestone 003) are unchanged — this feature adds
one operation over data that already exists, not new data.

## `DocumentIndex` interface extension

One new method on the interface defined in `src/core/document-index.ts`:

```ts
/**
 * Deletes `id`'s Source and every Document/Chunk (and embedding) that
 * belongs to it. Rejects with NotFoundError if no source matches `id` —
 * the same typed-rejection convention `fetch()` already uses, not a
 * silent no-op (FR-004).
 */
removeSource(id: string): Promise<void>;
```

Both implementations of `DocumentIndex` must implement it, per
Constitution Principle IV (interface-segregated storage — callers depend
on the interface, and both concrete implementations must satisfy it
identically):

- **`InMemoryDocumentIndex`** (test double, `tests/contract/`) — deletes
  the matching entries from its `sources`/`originToId`/`documents`/
  `chunks` `Map`s. No in-flight-job concern here: this test double has
  no background indexing to race against.
- **`SqliteDocumentIndex`** (production) — cascade-deletes across the
  five tables per research.md's confirmed SQL shape, plus the
  in-flight-job settle-and-recheck handling research.md's Decision
  covers.

## Cascade-delete order (`SqliteDocumentIndex.removeSource`)

Mirrors `deleteChunksForDocument`'s existing order, extended one level
up (source → its documents → each document's chunks):

1. Look up the source by `id`; if none, reject with `NotFoundError(id)`
   before touching any table.
2. For every `chunks` row belonging to any of the source's documents,
   delete its `chunk_vectors` row by `rowid` first (no trigger keeps this
   table in sync — same reasoning `deleteChunksForDocument` already
   documents).
3. Delete those `chunks` rows (`chunk_text_fts` stays in sync
   automatically via the existing `chunks_ad` trigger).
4. Delete the source's `documents` rows.
5. Delete the `sources` row itself.
6. If `inFlightJobs` has a job running for `id`, chain steps 2–5 again
   onto that job's promise, so anything it wrote after step 1 but before
   settling is also removed (research.md's Decision).

## State/lifecycle note

`Source.status` gains no new value — removal isn't a status a source
transitions through (e.g. no `'removed'` state); a removed source simply
no longer has a row, matching FR-002's "no longer appears in
`tome_list_sources`" and the hard-delete Assumption in spec.md (no
soft-delete/trash).

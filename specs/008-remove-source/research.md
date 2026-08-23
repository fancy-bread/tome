# Phase 0 Research: Remove a Source

One real unknown. Everything else in this feature reuses patterns
already established and proven by milestones 001–004 — no new
dependencies, no new storage, no new MCP wiring pattern.

## 1. Preventing an in-flight indexing job from resurrecting a removed source

**Decision**: `SqliteDocumentIndex.removeSource(id)` deletes the source's
rows immediately (synchronous, since `better-sqlite3` is sync), and
additionally checks `inFlightJobs` (the same `Map<sourceId, Promise<void>>`
`addSource` already uses for concurrent-refresh dedup, per milestone
003). If a job is in flight for `id`, `removeSource` chains a second
cascade-delete onto that job's promise — running once the job settles,
regardless of whether it succeeded, failed, or wrote anything in the
meantime — before returning control to that job's own `.finally()` (which
removes it from `inFlightJobs`).

**Rationale**: `runIndexingJob` (milestone 003) has no cancellation
mechanism — it's a detached background task holding only a `Source`
snapshot from the moment `addSource` called it, with no way to observe
that its source was removed mid-run. Without this second delete pass, a
source removed while `status: 'indexing'` would have its rows deleted
immediately (satisfying User Story 3's Acceptance Scenario 1 — gone from
`listSources` right away) but the in-flight job would still finish its
crawl and call `getDocumentByUri` (returns nothing, since the row is
gone) → take the "insert as new" branch → write fresh `documents`/
`chunks` rows carrying `source_id = id`, an id `sources` no longer has a
row for. Those orphaned chunks would still be indexed by FTS5 (the
`chunks_ai` trigger doesn't check `sources`) and would surface in future
`search()` calls. Worse, `buildRankedChunk`'s `getSourceById(...)!`
non-null assertion would then throw when building that ranked result —
turning an orphaned row into a `search()` crash, not just stale content.
This closes exactly the gap Acceptance Scenario 2 of User Story 3
requires (nothing from the in-progress run survives) and directly
prevents the `search()` crash risk, using only patterns
(`inFlightJobs`, "the last write wins, checked again after settling")
this codebase already relies on elsewhere.

**Alternatives considered**:
- *True cancellation (AbortSignal threaded into `runIndexingJob`)* —
  rejected as disproportionate: `runIndexingJob` has several `await`
  points (crawl, then one `embed()` call per chunk) that would each need
  an abort check, materially restructuring milestone 003's code for a
  narrow, already-rare race (removal landing in the exact window between
  `addSource` returning and the background job settling).
- *Block `removeSource` until any in-flight job for that id settles,
  then delete once* — rejected because it violates FR-006's "removal
  MUST take effect immediately": a slow crawl (bounded by the 30s
  `requestTimeoutMs` default from the 2026-08-01 battle-testing pass)
  would make `removeSource` itself hang for up to that long, and
  `listSources` would keep showing the "removed" source as `indexing`
  in the meantime.
- *Do nothing (accept the race)* — rejected: this isn't a hypothetical
  edge case being gold-plated, it's a documented `search()` crash path
  once traced through the existing code, not just stale-content risk.

## Confirmed non-unknowns (reused patterns, no new research needed)

- **Cascade-delete SQL shape**: identical in structure to
  `deleteChunksForDocument` (milestone 003) — no `ON DELETE CASCADE` on
  any foreign key (`better-sqlite3` doesn't enforce FKs unless a
  `PRAGMA` is set, and this schema never sets one), so `chunk_vectors`
  rows must be deleted explicitly by `rowid` before their `chunks` rows;
  `chunk_text_fts` stays in sync automatically via the existing
  `chunks_ad` trigger; `documents` and finally `sources` are deleted
  last.
- **Not-found error shape**: reuses `NotFoundError` (milestone 001,
  already thrown by `fetch()`) rather than introducing a second error
  type — `tome_remove_source`'s MCP handler needs no new error-mapping
  logic beyond the `withErrorHandling` wrapper every tool already uses.
- **MCP tool wiring**: identical shape to the existing four tools
  (milestone 004) — a `ToolDefinition` in `tool-descriptions.ts`, a
  `registerTool` call in `server.ts` wrapped in `withErrorHandling`.
- **Skill file**: identical shape to `/tome:add` (milestone 006) — a
  human-gated skill (`disable-model-invocation: true`) that parses
  `$ARGUMENTS`, asks for clarification rather than guessing on missing/
  ambiguous input, calls the MCP tool, reports the result in plain
  language.

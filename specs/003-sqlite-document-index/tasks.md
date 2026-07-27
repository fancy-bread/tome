---
description: "Task list for SQLite Document Index"
---

# Tasks: SQLite Document Index

**Input**: Design documents from `/specs/003-sqlite-document-index/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: This feature's headline proof (FR-016/SC-003) is a test —
milestone 001's `runDocumentIndexContractTests` suite, imported and run
unmodified against `SqliteDocumentIndex`. Test tasks here are the primary
way every requirement gets validated, same as milestones 001 and 002.

**Organization**: Tasks are grouped by user story from spec.md. All five
stories converge on one class (`SqliteDocumentIndex`, implementing
`DocumentIndex` + `TestableDocumentIndex`), so — as in milestone 001 —
"independent stories" means independently *testable*, not independently
*file-isolated*. Coverage note: `vitest.config.ts`'s coverage thresholds
(statements/functions/lines 95%, branches 90%) apply repo-wide, so this
milestone's new `src/storage/*.ts` files count toward the same gate.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Paths are relative to repo root

## Phase 1: Setup

**Purpose**: Add the dependencies this milestone needs beyond milestones 001-002's baseline

- [X] T001 Add `better-sqlite3` and `sqlite-vec` as runtime dependencies and `@types/better-sqlite3` as a dev dependency in `package.json`; run `npm install`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, query helper, and class skeleton every user story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Define `src/storage/schema.ts`: `CREATE TABLE` statements for `sources`/`documents`/`chunks` per data-model.md, `CREATE VIRTUAL TABLE chunk_vectors USING vec0(...)` (sqlite-vec, schema only — never written to this milestone), `CREATE VIRTUAL TABLE chunk_text_fts USING fts5(...)` (external-content table over `chunks.text`) plus the insert/update/delete triggers that keep it in sync. Verify during this task — not assumed from planning — that `better-sqlite3`'s prebuilt binary includes FTS5 and confirm `sqlite-vec`'s actual Node loading API against the installed package version (research.md's flagged open item; handle a mismatch the same way milestone 002 handled `pdf-parse`'s real API — fix and document it, don't block on it) (depends on T001)
- [X] T003 [P] Define `src/storage/fts-query.ts`: a function that sanitizes a free-text query for FTS5's `MATCH` operand — split on whitespace, double-quote each token, escape embedded `"`, join with a space (per research.md)
- [X] T004 Define the `SqliteDocumentIndex` class skeleton in `src/storage/sqlite-document-index.ts` per `specs/003-sqlite-document-index/contracts/sqlite-document-index.ts`: constructor opens the SQLite connection at `options.dbPath`, applies `schema.ts` on open, loads the `sqlite-vec` extension; implement `seedSource`/`seedDocument`/`seedChunk` for real (direct `INSERT` statements — these are pure test-support infrastructure with no dependency on crawling, needed for T005's reused suite to be meaningful at all); stub `addSource`/`search`/`fetch`/`listSources` to throw; implement `close()` (depends on T002, T003)
- [X] T005 Wire the reused contract suite in `tests/storage/sqlite-document-index.test.ts`: `runDocumentIndexContractTests((embedder) => new SqliteDocumentIndex({ dbPath: ':memory:', embedder }))` — imported from `tests/contract/document-index.contract.ts` unchanged, per FR-016 (depends on T004)

**Checkpoint**: Schema applies, class compiles against both `DocumentIndex` and `TestableDocumentIndex`, seed methods work — the reused suite runs (most of its tests still fail until stories below land, same checkpoint shape as milestone 001's T009)

---

## Phase 3: User Story 1 — Add a Source and See It Indexed (Priority: P1) 🎯 MVP

**Goal**: `addSource` persists a source, returns immediately, and indexes it in the background without blocking or crashing on failure

**Independent Test**: Add a source, confirm it's visible immediately with pending/indexing status, then confirm it later settles to ready (content queryable) or error (clear message)

### Implementation for User Story 1

- [X] T006 [US1] Implement `addSource()` in `sqlite-document-index.ts`: look up the origin in `sources`; if found, reuse its id and set `status: 'indexing'` (refresh path, FR-012); if not, insert a new row with `status: 'pending'`. Track the background job in an in-process `Map<sourceId, Promise<void>>` — a second call for an origin already in that map returns the existing row without starting another job (FR-015). Return the `Source` row immediately, before the job settles (FR-002) (depends on T005)
- [X] T007 [US1] Implement the private `runIndexingJob(source)` method: call milestone 002's `Crawler.crawl()`, then `Chunker.chunk()` on each `CrawledDocument`, `INSERT` the resulting `Document`/`Chunk` rows (insert-only for now — refresh/skip-unchanged logic lands in US5), then set `status: 'ready'` + `lastIndexedAt` on success or `status: 'error'` + the crawl's message on `CrawlResult.error`. Wrap the whole method body in try/catch so its returned promise can never reject — an uncaught exception here would be an unhandled rejection, violating Constitution Principle II (FR-003, FR-004, FR-005). Remove the source's entry from the in-flight map (T006) when the job settles — success or failure, via a `.finally()` on the tracked promise, not just its `.catch()` — per data-model.md's "Cleared once a job settles." Skipping this leaves the entry in the map forever, silently breaking every future `addSource` call for that origin (it would look permanently "in-flight" and refresh — FR-012 — would never run again) (depends on T006)
- [X] T008 [US1] Write `tests/storage/orchestration.test.ts` covering US1's three acceptance scenarios, reusing milestone 002's fixture techniques (a temp directory for a `path` source is simplest): `addSource` returns pending/indexing immediately; the source settles to ready with `lastIndexedAt` and its content becomes searchable; a source pointed at a nonexistent path settles to error without the test process seeing an unhandled rejection (depends on T007)

**Checkpoint**: A real source can be added, indexed end-to-end through milestone 002's crawler/chunker, and persisted — independent of search/fetch/listSources/refresh

---

## Phase 4: User Story 2 — Search Indexed Content (Priority: P1)

**Goal**: `search` returns ranked, lexically-matched chunks from real persisted content

**Independent Test**: Add a source, wait for it to index, search for text known to be in it, confirm matches come back labeled `rankedBy: 'lexical'`

### Implementation for User Story 2

- [X] T009 [US2] Implement `search()` in `sqlite-document-index.ts`: sanitize the query via `fts-query.ts`, run an FTS5 `MATCH` query against `chunk_text_fts` joined back to `chunks`/`documents`/`sources`, compute `score` as `-bm25(chunk_text_fts)` (per research.md's sign-convention decision), filter by `sourceId` when provided, map results to `RankedChunk` with `rankedBy: 'lexical'`, return `[]` for no matches or no sources (FR-006 through FR-009) (depends on T005)
- [X] T010 [US2] Add a test to `tests/storage/orchestration.test.ts` confirming `search()` finds content that was indexed via a *real* crawl (not seeded data) — proving the end-to-end crawl→chunk→persist→search path works, which the reused contract suite (seeded data only) can't prove on its own (depends on T007, T009)

**Checkpoint**: Search works against real persisted, crawled content — independent of fetch/listSources/refresh

---

## Phase 5: User Story 3 — Retrieve a Chunk or Document by Identifier (Priority: P1)

**Goal**: `fetch` returns real persisted content by id, or a structured error

**Independent Test**: Covered by the reused contract suite (T005) — `seedChunk`/`seedDocument` plus `fetch` together exercise FR-010 exactly as milestone 001 specified it; no additional storage-specific behavior exists to test beyond what the suite already proves

### Implementation for User Story 3

- [X] T011 [US3] Implement `fetch()` in `sqlite-document-index.ts`: look up the id in `chunks`, then `documents`; return the matching row mapped to the `Chunk`/`Document` shape, or reject with `NotFoundError` (FR-010) (depends on T005)

**Checkpoint**: `fetch` passes the reused contract suite's US3 tests

---

## Phase 6: User Story 4 — List Sources and Their Status (Priority: P2)

**Goal**: `listSources` returns every persisted source with its real, current status

**Independent Test**: Covered by the reused contract suite (T005) — `seedSource` plus `listSources` together exercise FR-011 exactly as milestone 001 specified it

### Implementation for User Story 4

- [X] T012 [US4] Implement `listSources()` in `sqlite-document-index.ts`: `SELECT` every row from `sources`, map to the `Source` shape (FR-011) (depends on T005)

**Checkpoint**: `listSources` passes the reused contract suite's US4 tests

---

## Phase 7: User Story 5 — Refresh Skips Unchanged Documents (Priority: P2)

**Goal**: Refreshing a source only re-chunks documents whose content actually changed

**Independent Test**: Index a source, refresh with no changes, confirm every chunk is byte-for-byte identical; change one document, refresh again, confirm only its chunks were replaced

### Implementation for User Story 5

- [X] T013 [US5] Extend `runIndexingJob` (T007) with refresh semantics: for each `CrawledDocument`, look up an existing row by `(source_id, uri)` — the natural key across crawls, since milestone 002's crawler regenerates `Document.id` every call (per research.md). If found and `content_hash` matches, skip entirely (leave the document and its chunks untouched — FR-013). If found and it differs, keep the same `Document.id`, update its metadata, delete its existing chunks, and insert freshly chunked ones (FR-014). If not found, insert as new (depends on T007)
- [X] T014 [US5] Write `tests/storage/refresh.test.ts` covering US5's two acceptance scenarios plus the concurrent-refresh-dedup edge case (FR-015). For the no-op-refresh scenario, assert both that every chunk's id and text are identical *and* that the refresh actually ran (e.g., `Source.lastIndexedAt` advances between the two calls, or a call-count on the crawler) — a chunk-identity check alone can't distinguish "change-detection correctly skipped re-chunking" from "the call did nothing because the in-flight map entry from the first index was never cleared" (see T007). For concurrent-refresh-dedup: two `addSource` calls for the same in-flight origin result in exactly one background job running (depends on T013)

**Checkpoint**: All five user stories independently pass — this is the full scope of milestone 003

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The one behavior no single-instance test can prove, plus final validation

- [X] T015 Write `tests/storage/persistence.test.ts` (SC-002): open a `SqliteDocumentIndex` against a real temp-file path (not `:memory:`), index a source, call `close()`, open a *new* `SqliteDocumentIndex` against the same file path, and confirm `listSources()`/`search()` see the same data without re-indexing (depends on T008, T014)
- [X] T016 Run `npx tsc --noEmit` from repo root and resolve any type errors across `src/storage/` and `tests/storage/` (depends on T015)
- [X] T017 Run `npm run test:coverage` and confirm every test passes and the repo-wide coverage gate (statements/functions/lines 95%, branches 90%) still holds with `src/storage/`'s new code included — add tests for any branch that drops the gate below threshold, the same way milestone 002 closed its own gap rather than lowering the bar (depends on T016)
- [X] T018 Run quickstart.md's validation scenarios end-to-end as a final sanity check (depends on T017)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–7)**: All depend on Foundational; US2/US3/US4 (Phases 4–6) are independently testable via the reused contract suite once Foundational lands; US5 (Phase 7) depends on US1's `runIndexingJob` (T007) existing to extend
- **Polish (Phase 8)**: Depends on all five user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories
- **User Story 2 (P1)**: No dependency on other stories for its core implementation (T009); its storage-specific test (T010) depends on US1's crawl orchestration (T007) existing to produce real data to search
- **User Story 3 (P1)**: No dependency on other stories
- **User Story 4 (P2)**: No dependency on other stories
- **User Story 5 (P2)**: Depends on US1's `runIndexingJob` (T007) — it's an extension of that method, not new standalone logic

### Within Each User Story

- Implementation before its acceptance-scenario tests (where a dedicated test exists)
- Story complete and checkpointed before moving to the next

### Parallel Opportunities

- T002 and T003 can run in parallel (independent files, no shared imports)
- Once Foundational (T002–T005) completes, US3 (T011, `fetch`) and US4 (T012, `listSources`) are small, independent method implementations that could be built in parallel with each other and with US2's `search()` (T009) — all three converge on the same `sqlite-document-index.ts` file, same caveat as milestone 001's convergence note, but their logic doesn't depend on one another
- US5 (T013) cannot start until US1's `runIndexingJob` (T007) exists, since it extends that method rather than adding new logic

---

## Parallel Example: Foundational Phase

```bash
# After T001:
Task: "Define src/storage/schema.ts"
Task: "Define src/storage/fts-query.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Add a Source and See It Indexed)
4. **STOP and VALIDATE**: the reused contract suite's US1 tests pass, plus `orchestration.test.ts`
5. This proves real crawl→chunk→persist orchestration works before investing in search/fetch/listSources/refresh

### Incremental Delivery

1. Setup + Foundational → schema applies, class compiles, seed methods work
2. Add US1 → validate → real indexing works end-to-end
3. Add US2 → validate → search works against real persisted content
4. Add US3 + US4 → validate → reused suite's remaining tests pass
5. Add US5 → validate → refresh is efficient, not just correct
6. Polish → cross-restart persistence, type-check, coverage gate, quickstart

## Notes

- US1–US5 converge on `sqlite-document-index.ts` because they're all
  methods of one class implementing one interface (`DocumentIndex`) plus
  one test-support interface (`TestableDocumentIndex`) — expected, not a
  sign the stories aren't independent, same pattern as milestone 001.
- No task in this file touches `src/mcp/` or `src/embedding/` — those
  belong to milestones 004–005. `chunk_vectors` is created but never
  written to; every chunk here has `embedding: null`.
- Commit after each checkpoint (end of each phase).

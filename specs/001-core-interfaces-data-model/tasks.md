---
description: "Task list for Core Interfaces & Data Model"
---

# Tasks: Core Interfaces & Data Model

**Input**: Design documents from `/specs/001-core-interfaces-data-model/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: This feature's deliverable *is* a contract-test suite (per
spec.md SC-003 and quickstart.md) — test tasks below are not optional
scaffolding, they're the primary way the interfaces get validated, since
there's no other runtime behavior in this feature to exercise.

**Organization**: Tasks are grouped by user story from spec.md. All four
stories share one `DocumentIndex` interface (FR-011 requires this), so
the interface itself is Foundational; each story phase then implements
and tests that story's slice of the in-memory test double's behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Paths are relative to repo root

## Phase 1: Setup

**Purpose**: Project scaffolding — this is the first feature to add source code to the repo

- [X] T001 Initialize `package.json` at repo root: `"type": "module"`, TypeScript + Vitest + `@types/node` as dev dependencies, `test` and `build` scripts; run `npm install`
- [X] T002 [P] Configure `tsconfig.json` at repo root: `strict: true`, `module`/`moduleResolution: NodeNext`, `target: ES2022`, `outDir: dist`
- [X] T003 [P] Configure `vitest.config.ts` at repo root

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `DocumentIndex`/`Embedder` contracts and the test scaffolding every user story implements against

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Define shared data types in `src/core/types.ts` — `SourceType`, `SourceStatus`, `Source`, `Document`, `Chunk`, `RankedBy`, `RankedChunk` — per `specs/001-core-interfaces-data-model/contracts/types.ts`
- [X] T005 [P] Define the `Embedder` interface in `src/core/embedder.ts` per `specs/001-core-interfaces-data-model/contracts/embedder.ts`
- [X] T006 Define the `DocumentIndex` interface and `NotFoundError` in `src/core/document-index.ts` per `specs/001-core-interfaces-data-model/contracts/document-index.ts` (imports types from T004)
- [X] T007 Create the in-memory test double skeleton in `tests/contract/in-memory-document-index.ts` implementing `DocumentIndex` and `Embedder` with stub method bodies (depends on T005, T006)
- [X] T008 Create the contract-test suite scaffold in `tests/contract/document-index.contract.ts` — export `runDocumentIndexContractTests(makeIndex: () => DocumentIndex)` with one empty `describe` block per user story (depends on T006)
- [X] T009 Wire the suite to the test double in `tests/contract/document-index.test.ts`: `runDocumentIndexContractTests(() => new InMemoryDocumentIndex())` (depends on T007, T008)

**Checkpoint**: Contracts compile, scaffold runs (with empty test bodies) — user story implementation can begin

---

## Phase 3: User Story 1 — Add a Source (Priority: P1) 🎯 MVP

**Goal**: A caller can register a source and get back a unique identifier and pending status immediately, without a duplicate ever being created for the same origin

**Independent Test**: Submit a source, get an identifier with pending/indexing status; submit the same origin again and confirm no second identifier is created

### Implementation for User Story 1

- [X] T010 [US1] Implement `addSource` in `tests/contract/in-memory-document-index.ts`: unique id assignment, `pending`→`indexing` status, dedupe-by-`origin` (refresh, not duplicate), concurrent same-origin calls resolve to one record (depends on T009)
- [X] T011 [US1] Write User Story 1's three acceptance scenarios as tests in `tests/contract/document-index.contract.ts`'s US1 `describe` block: new source → id + pending/indexing status; resubmitting an existing origin → same identifier returned, not a new one (SC-004, id-stability half); two concurrent submissions of a new origin → exactly one record (depends on T010)

**Checkpoint**: `addSource` is fully verified independent of search, fetch, or listing

---

## Phase 4: User Story 2 — Search Indexed Content (Priority: P1)

**Goal**: A caller gets ranked, relevant results for a query, with results still returned (lexically ranked) when semantic ranking is unavailable

**Independent Test**: Seed the test double with chunks, query with related text, confirm ranked results labeled with their ranking method; disable the embedder and confirm results still come back

### Implementation for User Story 2

- [X] T012 [US2] Add a seeding helper to `tests/contract/in-memory-document-index.ts` for pre-loading sources/documents/chunks, and implement `search`: rank via `Embedder.embed()` when it resolves a vector, fall back to lexical matching when it resolves `null`, label each result's `rankedBy` accordingly, return `[]` for no matches or no sources (depends on T009)
- [X] T013 [US2] Write User Story 2's four acceptance scenarios as tests in `tests/contract/document-index.contract.ts`'s US2 `describe` block: relevant chunks ranked and labeled; embedder unavailable → lexical results, no error; no matching content → empty array; no sources at all → empty array (depends on T012)

**Checkpoint**: `search` is fully verified, including the graceful-degradation path (Constitution Principle II)

---

## Phase 5: User Story 3 — Retrieve a Chunk or Document by Identifier (Priority: P1)

**Goal**: A caller can fetch the full content behind a search result, and gets a structured error — not a crash — for an unknown identifier

**Independent Test**: Fetch a known id and confirm full text + metadata; fetch an unknown id and confirm a caught `NotFoundError`, not an uncaught exception

### Implementation for User Story 3

- [X] T014 [US3] Implement `fetch` in `tests/contract/in-memory-document-index.ts`: return full text + source metadata for a known chunk/document id; reject with `NotFoundError` for an unknown id (depends on T009)
- [X] T015 [US3] Write User Story 3's two acceptance scenarios as tests in `tests/contract/document-index.contract.ts`'s US3 `describe` block: known id → full text + metadata; unknown id → `NotFoundError` rejection caught by the test, not a process crash (depends on T014)

**Checkpoint**: `fetch` is fully verified, including its error path

---

## Phase 6: User Story 4 — List Sources and Their Status (Priority: P2)

**Goal**: A caller can see every added source's type, origin, status, and last-indexed time, including a human-readable explanation for failed sources

**Independent Test**: Add a source, list immediately (pending/indexing); separately, seed a source directly in `error` status and confirm it lists with its explanation

### Implementation for User Story 4

- [X] T016 [US4] Implement `listSources` in `tests/contract/in-memory-document-index.ts`: return every source's type, origin, status, and `lastIndexedAt`; extend the test double with a way to seed a `Source` directly in `error` status with an `error` message (there's no failure-producing crawl in this feature to reach that state organically, so the test double must accept it as seed input) (depends on T009)
- [X] T017 [US4] Write User Story 4's two acceptance scenarios as tests in `tests/contract/document-index.contract.ts`'s US4 `describe` block: sources listed with all required fields; a source seeded in `error` status (via T016's seeding addition) shows `status: 'error'` with a human-readable `error`. Add one further check alongside them, not from spec.md's US4 scenarios directly but closing the loop on SC-004: resubmitting an existing origin (from US1) results in exactly one entry for that origin in `listSources()` (SC-004, list-uniqueness half) (depends on T016)

**Checkpoint**: All four user stories independently pass — this is the full scope of milestone 001

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate the edge cases spanning multiple stories, and confirm the feature is ready for milestone 002/003 to build on

- [X] T018 Add spec.md's four Edge Cases as tests in `tests/contract/document-index.contract.ts`: concurrent refresh of the same in-flight origin doesn't start a second refresh; a search over a partial-embedding-backlog corpus mixes `rankedBy: 'vector'` and `rankedBy: 'lexical'` results correctly; a source that fails partway through indexing keeps what it already indexed searchable; `fetch` on a never-existent id returns a structured error (depends on T011, T013, T014, T015, T016, T017)
- [X] T019 Run `npx tsc --noEmit` from repo root and resolve any type errors across `src/core/` and `tests/contract/` (depends on T018)
- [X] T020 Run `npm test` and confirm every test passes, covering SC-001, SC-002, SC-004, and SC-005 per quickstart.md's Expected Outcome section (SC-003 is intentionally deferred — it completes in milestone 003 when the same suite runs against `SqliteDocumentIndex`) (depends on T019)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–6)**: All depend on Foundational; independent of each other (each operates on a different `DocumentIndex` method)
- **Polish (Phase 7)**: Depends on all four user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories
- **User Story 2 (P1)**: No dependency on other stories (does not require US1's `addSource` logic to be "real" — seeding is direct, per T012)
- **User Story 3 (P1)**: No dependency on other stories
- **User Story 4 (P2)**: No dependency on other stories

### Within Each User Story

- Implementation (in-memory double behavior) before its acceptance-scenario tests
- Story complete and checkpointed before moving to the next

### Parallel Opportunities

- T002 and T003 can run in parallel once T001 completes
- T004 and T005 can run in parallel (independent files, no shared imports)
- Once Foundational (Phase 2) completes, US1–US4 implementation tasks (T010, T012, T014, T016) could be built in parallel by different contributors, since each touches a distinct `DocumentIndex` method — though all land in the same two files (`in-memory-document-index.ts`, `document-index.contract.ts`), so in practice sequential is simpler for a single implementer

---

## Parallel Example: Foundational Phase

```bash
# After T001 (package.json + npm install):
Task: "Configure tsconfig.json at repo root"
Task: "Configure vitest.config.ts at repo root"

# After T001-T003:
Task: "Define shared data types in src/core/types.ts"
Task: "Define the Embedder interface in src/core/embedder.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Add a Source)
4. **STOP and VALIDATE**: `npm test` passes for US1's scenarios alone
5. This proves the contract and scaffolding work before investing in the remaining three stories

### Incremental Delivery

1. Setup + Foundational → contracts compile, scaffold runs
2. Add US1 → validate → this is the smallest provable slice
3. Add US2 → validate → search + graceful degradation proven
4. Add US3 → validate → fetch + error path proven
5. Add US4 → validate → all four operations proven; milestone 001 complete
6. Polish → edge cases, type-check, full suite green

## Notes

- All four user stories converge on the same two files
  (`in-memory-document-index.ts` and `document-index.contract.ts`) because
  they're all facets of one interface (FR-011) — this is expected for a
  contracts-only feature and is not a sign the stories aren't independent;
  each story's *tests* can be run and pass in isolation regardless of
  whether later stories' methods are implemented yet.
- No task in this file touches `src/ingestion/`, `src/storage/`,
  `src/mcp/`, or `src/embedding/` — those belong to milestones 002–005
  per plan.md's Project Structure.
- Commit after each checkpoint (end of each phase).

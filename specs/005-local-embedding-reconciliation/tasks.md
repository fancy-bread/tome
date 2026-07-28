---
description: "Task list for Local Embedding & Reconciliation"
---

# Tasks: Local Embedding & Reconciliation

**Input**: Design documents from `/specs/005-local-embedding-reconciliation/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: This milestone's headline claim — "semantic search actually
ranks by meaning, for the first time" (SC-001) — and its graceful-
degradation and recovery counterparts (SC-002, SC-003) are all proven by
tests, same as every prior milestone. Test tasks here are the primary
validation mechanism, not optional scaffolding.

**Organization**: Tasks are grouped by user story from spec.md. No new
top-level Setup phase — this milestone adds no new dependency, build
config, or lint config (research.md #1). Foundational work is
`OllamaEmbedder` itself, since all three user stories call it or depend
on code that does.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Paths are relative to repo root

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: A trustworthy `Embedder` implementation every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 [P] Implement `OllamaEmbedder` in `src/embedding/ollama-embedder.ts` per `contracts/ollama-embedder.ts`: `constructor(options?: { baseUrl?: string; model?: string })` defaulting to `http://localhost:11434` and `nomic-embed-text`; `embed(text)` POSTs `{ model, prompt: text }` to `${baseUrl}/api/embeddings` using native `fetch`, and returns the parsed `embedding` array only if the response is a 2xx with a JSON body whose `embedding` field is an array of exactly 768 numbers — every other outcome (network error, non-2xx, unparseable body, missing field, wrong length) returns `null`, never throws (research.md #1–#2)
- [X] T002 [P] Write `tests/embedding/ollama-embedder.test.ts`: spin up a real local `node:http` server (mirroring `tests/ingestion/url-crawler.test.ts`'s pattern, per quickstart.md) and cover: a successful request returns the parsed vector; a non-2xx response returns `null`; a malformed JSON body returns `null`; a body missing `embedding` returns `null`; an `embedding` of the wrong length (e.g. 3 numbers instead of 768) returns `null`; an unreachable server (closed port) returns `null`; and, separately, that `new OllamaEmbedder()` constructed with **no options** targets `http://localhost:11434` by default (e.g. by binding the test server to that exact port for this one scenario and confirming the default-constructed instance reaches it) — proving FR-011/SC-004's "local by default" guarantee is real, not just documented (depends on T001)

**Checkpoint**: `OllamaEmbedder` is a fully-tested, trustworthy `Embedder` implementation — user story work can begin

---

## Phase 2: User Story 1 — Semantic Search Actually Ranks by Meaning (Priority: P1) 🎯 MVP

**Goal**: Chunks are embedded at write time; a query semantically related to indexed content, but sharing no keywords with it, ranks by vector similarity

**Independent Test**: Add a source containing a passage whose wording doesn't overlap with a test query, wait for indexing to finish, search with that query, confirm the passage ranks with `rankedBy: "vector"`

### Implementation for User Story 1

- [X] T003 [US1] In `src/storage/sqlite-document-index.ts`'s `runIndexingJob`, call `await this.embedder.embed(chunk.text)` for each chunk produced by `this.chunker.chunk(...)` in both the new-document and changed-document branches, setting `chunk.embedding` to the result before `this.insertChunk(chunk)` (research.md #3) (depends on T001)
- [X] T004 [US1] Update `src/index.ts`: construct the daemon's `SqliteDocumentIndex` with `new OllamaEmbedder()` (imported from `src/embedding/ollama-embedder.ts`) instead of the inline `NoOpEmbedder`, and delete the now-unused `NoOpEmbedder` class entirely (depends on T001)

### Tests for User Story 1

- [X] T005 [US1] Write `tests/storage/reconciliation.test.ts`'s SC-001 scenario: using a real local http test server (T002's pattern) as the embedding backend behind a real `OllamaEmbedder`, add a source whose content is embedded as similar to a test query despite sharing no keywords with it, wait for the source to reach `ready`, search with that query, and confirm the top result has `rankedBy: "vector"` (depends on T003)

**Checkpoint**: Semantic ranking is real and provable for the first time

---

## Phase 3: User Story 2 — Indexing Never Fails Just Because Embedding Is Down (Priority: P1)

**Goal**: A source indexes successfully and remains immediately searchable even when the embedding service is unavailable for some or all of its chunks

**Independent Test**: Construct the index with an embedder that always returns `null`, add a source, confirm it reaches `ready` with its content searchable by keyword

### Implementation for User Story 2

No new production code — this behavior already falls out of US1's wiring (T003): `embed()` returning `null` leaves `chunk.embedding` `null`, and `insertChunk` has branched on a falsy embedding to skip the `chunk_vectors` write since milestone 003. This story is proven, not built.

### Tests for User Story 2

- [X] T006 [US2] Write `tests/storage/reconciliation.test.ts`'s SC-002 scenario: construct `SqliteDocumentIndex` with a small fake `Embedder` whose `embed()` always resolves `null` (proving the `DocumentIndex`-level contract independent of Ollama specifically), add a source, confirm it reaches `ready` status, that a lexical query against its content returns results with `rankedBy: "lexical"`, and that no error is ever surfaced. Add a second scenario in the same file covering spec.md's mixed-outcome edge case: a fake `Embedder` whose `embed()` fails for some chunks and succeeds for others within the *same* source (e.g. alternating by call count), confirming the source still reaches `ready` and each chunk's `rankedBy` independently reflects its own embedding outcome, not the source's overall state (depends on T003)

**Checkpoint**: Graceful degradation holds at chunk-write time, per Constitution Principle II

---

## Phase 4: User Story 3 — Content Catches Up Automatically Once Embedding Recovers (Priority: P2)

**Goal**: Chunks written with `null` embeddings acquire real ones once the embedding service starts succeeding, with no restart or manual re-index

**Independent Test**: Index a source while the embedder always fails, then make it succeed, and confirm the chunks acquire real embeddings without any user action beyond waiting

### Implementation for User Story 3

- [X] T007 [US3] Add `reconciliationIntervalMs` to `SqliteDocumentIndexOptions` in `src/storage/sqlite-document-index.ts` per `contracts/sqlite-document-index.ts`, defaulting to a fixed production interval (e.g. 30000ms) — a test seam, not user-facing configuration (research.md #6)
- [X] T008 [US3] Implement a private `reconcileNullEmbeddings()` method on `SqliteDocumentIndex`: runs the query from research.md #5 (every chunk with no matching `chunk_vectors` row), calls `this.embedder.embed(chunk.text)` for each, and inserts a `chunk_vectors` row for any that succeed; guarded by a private `reconciling` boolean that makes the whole method a no-op if a pass is already in flight (FR-010) (depends on T007)
- [X] T009 [US3] Wire `reconcileNullEmbeddings()` into the constructor: fire one pass immediately, fire-and-forget, not awaited (FR-006's startup pass), and start a `setInterval(() => this.reconcileNullEmbeddings(), reconciliationIntervalMs)` for the recurring pass (FR-005); update `close()` to `clearInterval` this timer so no caller leaks it (depends on T008)

### Tests for User Story 3

- [X] T010 [US3] Write `tests/storage/reconciliation.test.ts`'s SC-003 scenario: construct `SqliteDocumentIndex` with a small `reconciliationIntervalMs` and a fake embedder that starts out always returning `null`, add a source (its chunks land with `null` embeddings), then switch the fake embedder to return real vectors, poll briefly, and confirm the chunks acquire real embeddings and become vector-ranked with no explicit re-add or restart (FR-007). Add a second scenario in the same file proving FR-008's other half: a fake embedder that keeps returning `null` across a reconciliation pass — confirm the chunk remains `null`/lexically-searchable, no error surfaces, and it is still a candidate on the *next* pass (i.e. not permanently skipped after one failed re-attempt) (depends on T009)
- [X] T011 [US3] Write `tests/storage/reconciliation.test.ts`'s startup-pass scenario, isolating FR-006 from FR-005: construct `SqliteDocumentIndex` with a **long** `reconciliationIntervalMs` (long enough that the recurring interval cannot plausibly have fired yet) and a fake embedder that always succeeds, add a source with a pre-existing `null`-embedding chunk via `seedChunk`, and confirm that chunk is reconciled shortly after construction anyway — proving the startup pass runs independently of the recurring schedule, not merely alongside a short interval that would mask its absence (depends on T009)
- [X] T012 [US3] Write `tests/storage/reconciliation.test.ts`'s SC-005 scenario: using a fake embedder whose `embed()` resolves after a deliberate delay (simulating a slow reconciliation pass in flight), issue a concurrent `addSource` and `search` call and confirm both complete correctly and promptly, not blocked by reconciliation (FR-009) (depends on T009)
- [X] T013 [US3] Write a test proving FR-010 directly: force two reconciliation passes to overlap (a slow-resolving fake embedder plus a very short `reconciliationIntervalMs`) and confirm no chunk is embedded twice and no duplicate/conflicting `chunk_vectors` row or error results (depends on T009)

**Checkpoint**: All three user stories independently pass — full milestone scope

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across the whole milestone

- [X] T014 Run `npx tsc --noEmit` from repo root and resolve any type errors across `src/embedding/`, `src/storage/`, `src/index.ts`, and `tests/` (depends on T005, T006, T010, T011, T012, T013)
- [X] T015 Run `npm run test:coverage` and confirm every test passes and the repo-wide coverage gate (statements/functions/lines 95%, branches 90%) still holds with `src/embedding/` and the modified `src/storage/sqlite-document-index.ts` included — close any real gap with a test, don't lower the threshold, per precedent from milestones 002, 003, and 004 (depends on T014)
- [X] T016 Run quickstart.md's manual smoke test against a real local Ollama instance if one is available in the current environment; if Ollama isn't installed, explicitly report that this step was skipped rather than silently treating it as passed (depends on T015) — **Outcome**: Ollama is installed but not running, and `nomic-embed-text` was not confirmed pulled; user opted to skip starting the service and downloading the model rather than doing so unprompted. Explicitly recorded as skipped, not passed — no bearing on T001-T015's automated coverage of every SC.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately; BLOCKS all user stories
- **User Stories (Phases 2–4)**: All depend on Foundational; US2 also depends on US1's T003 (the wiring US2 only verifies); US3 is independent of US1/US2's specific outcomes but depends on the same T003 wiring existing
- **Polish (Phase 5)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (T001). No dependency on other stories.
- **User Story 2 (P1)**: Depends on Foundational (T001) and US1's T003 (the write-time embedding call whose `null` path this story verifies) — no new production code of its own.
- **User Story 3 (P2)**: Depends on Foundational (T001). Independently implementable from US1/US2, though it's most meaningfully tested once US1/US2 exist (a chunk has to have been written with a `null` embedding to reconcile).

### Within Each User Story

- Implementation before its acceptance-scenario tests
- Story complete and checkpointed before moving to the next

### Parallel Opportunities

- T001 and T002 are the only fully parallel pair (implementation vs. its own test file can be drafted together, though T002 obviously needs T001 to exist to import)
- T007, T008, T009 are sequential (each depends on the previous) — no parallelism within US3's implementation
- T010, T011, T012, T013 all extend the same `tests/storage/reconciliation.test.ts` file with independent scenarios — parallelizable in principle by different contributors, same file-convergence caveat as every prior milestone's test files

---

## Parallel Example: Foundational Phase

```bash
# T001 must land first; T002 is drafted immediately after:
Task: "Implement OllamaEmbedder in src/embedding/ollama-embedder.ts"
Task: "Write tests/embedding/ollama-embedder.test.ts against a local http test server"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (`OllamaEmbedder`, fully tested)
2. Complete Phase 2: User Story 1 (write-time embedding + real daemon wiring)
3. **STOP and VALIDATE**: a semantically-related, keyword-disjoint query ranks by vector similarity
4. This proves the milestone's headline claim — "semantic search is real" — before investing in degradation and recovery behavior

### Incremental Delivery

1. Foundational → `OllamaEmbedder` trustworthy in isolation
2. Add US1 → validate → semantic ranking works end-to-end (MVP!)
3. Add US2 → validate → degradation holds when Ollama is down (mostly proof, not new code)
4. Add US3 → validate → recovery is automatic, no restart needed
5. Polish → type-check, coverage gate, optional real-Ollama manual smoke test

## Notes

- No task touches `src/mcp/` or any skill-file/plugin-packaging concern
  (milestones 006–007) — this milestone is entirely below the MCP
  protocol boundary milestone 004 established.
- `tests/storage/reconciliation.test.ts` is shared across US1, US2, and
  US3 (one file, multiple scenarios) — expected, not a sign the stories
  aren't independent, same pattern `tests/mcp/server.test.ts` set in
  milestone 004.
- Commit after each checkpoint (end of each phase).

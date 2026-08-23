---

description: "Task list for Remove a Source"
---

# Tasks: Remove a Source

**Input**: Design documents from `/specs/008-remove-source/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: This feature's core claim — "removing a source actually
deletes its content, and closes the in-flight-job race that would
otherwise crash `search()`" — is proven by tests, same as every prior
milestone. Test tasks here are the primary validation mechanism, not
optional scaffolding.

**Organization**: Tasks are grouped by user story from spec.md. As in
milestone 004's `tasks.md`, "independent stories" means independently
*testable*, not independently *file-isolated* — US1's core cascade-delete
implementation is one method (`SqliteDocumentIndex.removeSource`) that
US2's not-found case also exercises; US2 adds only the test proving that
already-implemented branch, not a separate implementation. US3 is the one
story with genuinely additive implementation (the in-flight-job race
close from research.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, and not blocked by any
  task in the same batch that hasn't landed yet (a task can still carry
  a dependency on an *earlier* phase's task and be marked `[P]` relative
  to its siblings within its own phase)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Paths are relative to repo root

## Phase 1: Setup

No setup tasks — this feature adds no new dependency, no new top-level
module, and no new project structure (plan.md's Technical Context).
Proceeds directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The interface extension every user story, tool, and test in this feature builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 [P] Add `removeSource(id: string): Promise<void>` to the `DocumentIndex` interface in `src/core/document-index.ts`, documented to reject with the existing `NotFoundError` for an unknown id (data-model.md)
- [X] T002 [P] Implement `removeSource` on `InMemoryDocumentIndex` in `tests/contract/in-memory-document-index.ts`: delete the matching entries from its `sources`/`originToId`/`documents`/`chunks` maps; reject `NotFoundError` if `id` isn't in `sources` (depends on T001)

**Checkpoint**: The interface and its in-memory implementation exist — contract tests and user story implementation can now begin

---

## Phase 3: User Story 1 - Remove a source and its content disappears from search (Priority: P1) 🎯 MVP

**Goal**: A user can remove a source through `tome_remove_source`/`/tome:remove`; it disappears from `tome_list_sources` and its content stops appearing in `tome_search`/`tome_fetch`

**Independent Test**: Add a source, confirm its content is searchable, remove it, confirm it's gone from the source list and no longer searchable/fetchable

### Implementation for User Story 1

- [X] T003 [US1] Implement `SqliteDocumentIndex.removeSource(id)` in `src/storage/sqlite-document-index.ts`: look up the source (reject `NotFoundError` if missing), then cascade-delete per data-model.md steps 1-5 — each of the source's documents' chunks' `chunk_vectors` rows by `rowid`, then those `chunks` rows (`chunk_text_fts` stays in sync via the existing `chunks_ad` trigger), then the `documents` rows, then the `sources` row (depends on T001)
- [X] T004 [P] [US1] Add `TOME_REMOVE_SOURCE` to `src/mcp/tool-descriptions.ts` per `contracts/tools.ts` — including the deliberately-discouraging description text (Constitution Principle III applied in reverse for a destructive tool) (depends on T001)
- [X] T005 [P] [US1] Add a test to `tests/mcp/server.test.ts` asserting `TOME_REMOVE_SOURCE.description` discourages unprompted/autonomous invocation — mirrors the existing `'describes tome_search as something to call proactively...'` test (Constitution Principle III), but for the inverted claim this feature's plan.md makes (depends on T004)
- [X] T006 [US1] Register the `tome_remove_source` handler in `src/mcp/server.ts`: call `index.removeSource(id)`, return a success result; wrapped in the existing `withErrorHandling` (no new error-mapping needed — `NotFoundError` already becomes `isError: true`) (depends on T003, T004)
- [X] T007 [P] [US1] Create `skills/remove/SKILL.md` for `/tome:remove`, mirroring `skills/add/SKILL.md`'s human-gated shape (`disable-model-invocation: true`): parse `$ARGUMENTS` for a source id, ask for clarification rather than guessing if it's missing, call `tome_remove_source`, report the result in plain language, surface a failed call readably. No blocking dependency — the tool's name and shape are already fixed by `contracts/tools.ts`, so this can be written alongside T003–T006
- [X] T008 [P] [US1] Add success-path `removeSource` cases to the shared `tests/contract/document-index.contract.ts` suite (runs against both `InMemoryDocumentIndex` and `SqliteDocumentIndex`, per the FR-016/SC-003 pattern): removing a source deletes it from `listSources()`; a `search()` query that previously matched its content returns nothing from it afterward; a previously-fetchable chunk/document id rejects `NotFoundError` via `fetch()` afterward (depends on T002, T003)
- [X] T009 [US1] Add a `tome_remove_source` success-path test to `tests/mcp/end-to-end.test.ts`: add a source, wait for it to index, `tome_search` for known content, `tome_fetch` one of the resulting chunk ids to confirm it resolves, `tome_remove_source` it, then repeat both the same `tome_search` (confirm nothing from it appears) and the same `tome_fetch` call (confirm `isError: true`) — proving removal at the MCP protocol layer for both read paths, not just `search()` (depends on T006)
- [X] T010 [P] [US1] Add a `describe('skills/remove/SKILL.md', ...)` block to `tests/skills/skill-files.test.ts`, mirroring the `add`/`sources`/`search` blocks: correct frontmatter, targets `tome_remove_source`, instructs asking for clarification on a missing argument, instructs surfacing a failed call readably (depends on T007)
- [X] T011 [US1] Update `tests/plugin/plugin-config.test.ts`'s expected skill directory list from `['add', 'sources', 'search']` to include `'remove'` (depends on T007)

**Checkpoint**: Removing a source works end-to-end through MCP and the skill command — User Story 1 is independently functional and deployable as the MVP

---

## Phase 4: User Story 2 - Get a clear error when removing a source that doesn't exist (Priority: P2)

**Goal**: Removing an unknown source identifier reports a clear, specific error rather than a silent no-op or a crash

**Independent Test**: Attempt to remove a source identifier that was never added (or already removed); confirm a clear "not found" error, not a silent success or a crash

### Implementation for User Story 2

- [X] T012 [P] [US2] Add the not-found case to the shared contract suite (`tests/contract/document-index.contract.ts`): `removeSource` with an unknown id rejects `NotFoundError`, for both implementations (depends on T008)
- [X] T013 [P] [US2] Add a `tome_remove_source` not-found test to `tests/mcp/server.test.ts`: an unknown id returns `isError: true` with a specific message, and the server remains responsive to a later call afterward — mirrors the existing `tome_fetch` unknown-id test (depends on T009). Touches a different file than T012 — the two can run in parallel

**Checkpoint**: Nonexistent-id removal is proven safe and clearly reported — User Story 2 is independently verified without needing User Story 3

---

## Phase 5: User Story 3 - Remove a source that's still being indexed (Priority: P3)

**Goal**: Removing a source that's still in the background `indexing` job doesn't let that job resurrect it or leak orphaned, unreachable-by-listSources content into search results

**Independent Test**: Add a source, remove it before its background indexing finishes, wait for what that indexing would have done, confirm it never reappears in `listSources()` and none of its content becomes searchable

### Implementation for User Story 3

- [X] T014 [US3] Extend `SqliteDocumentIndex.removeSource` with the in-flight-job settle-and-recheck logic from research.md's Decision: after the initial cascade-delete, if `inFlightJobs` has a job running for `id`, chain a second cascade-delete onto that job's promise so it resolves once the job settles — closing the race where `runIndexingJob` could otherwise write orphaned `documents`/`chunks` rows after the source row is gone (depends on T003)
- [X] T015 [US3] Add the in-flight-job race test to new file `tests/storage/remove-source.test.ts` (`SqliteDocumentIndex` only — `InMemoryDocumentIndex` has no background job to race against): add a source, call `removeSource(id)` before its background job settles, wait for the job to finish, assert `listSources()` never shows `id` again and `search()` never surfaces any of its content (depends on T014)
- [X] T016 [P] [US3] Add the cross-source non-interference case to `tests/storage/remove-source.test.ts`: with two sources indexed, removing one leaves the other's `listSources()`/`search()`/`fetch()` results completely unchanged (SC-004/FR-007) (depends on T014)

**Checkpoint**: All three user stories are independently functional — the `search()` crash risk research.md identified is closed and proven closed by a real test, not just design intent

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 Run `specs/008-remove-source/quickstart.md`'s manual/exploratory check against the real installed plugin — mirrors the 2026-08-01/2026-08-02 battle-testing sessions: `tome_add_source`, `tome_search` for known content, `tome_fetch` a result, `tome_remove_source`, repeat both the `tome_search` (confirm nothing appears) and the `tome_fetch` call (confirm `isError: true`)
- [X] T018 [P] Run the full `npm test` suite; confirm zero regressions in the other four MCP tools, the three existing skills, and all prior storage/ingestion tests

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — skipped, no tasks
- **Foundational (Phase 2)**: No dependencies — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational and on T008/T009 (US1's contract/MCP test scaffolding it extends) — no new implementation, so no dependency on US3
- **User Story 3 (Phase 5)**: Depends on Foundational and on T003 (US1's base `removeSource` implementation, which it extends) — independently testable from US2
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- T003 (core cascade-delete) before T006 (handler that calls it) and before T008 (contract tests that exercise it)
- T004 (tool definition) before T005 (description-content test), T006 (handler registration)
- T007 (skill file) before T010/T011 (tests that exercise it)
- T008 (contract test scaffolding) before T012 (US2 extends the same suite)
- T009 (MCP end-to-end test scaffolding) before T013 (US2 extends the same test file)
- T014 (race-close implementation) before T015/T016 (tests that prove it)

### Parallel Opportunities

- T001 and T002 (Foundational) touch different files — run in parallel
- Within US1: T004 and T007 (tool description, skill file) touch different files and neither blocks the other — run in parallel with each other and with T003
- T005 depends on T004 but touches a different file than T006/T007 — can run in parallel with either once T004 lands
- T008 and T010 (contract tests, skill test) touch different files — run in parallel once their respective dependencies (T002+T003, T007) land
- Within US2: T012 and T013 touch different files and don't depend on each other — run in parallel once their respective dependencies (T008, T009) land
- Within US3: T016 (cross-source case) can run in parallel with T015 once T014 lands — different assertions in the same new file, but no shared mutable fixture state between them if written as separate `it` blocks
- T018 (full suite run) has no file dependency but is logically last — run after everything else

---

## Parallel Example: User Story 1

```bash
# Once T004 (tool definition) lands, launch the description test and the handler/skill work together:
Task: "Add description-content test for TOME_REMOVE_SOURCE to tests/mcp/server.test.ts"
Task: "Create skills/remove/SKILL.md mirroring skills/add/SKILL.md"

# Once T002+T003 (both removeSource implementations) land, launch the two test additions together:
Task: "Add success-path removeSource cases to tests/contract/document-index.contract.ts"
Task: "Add describe('skills/remove/SKILL.md', ...) block to tests/skills/skill-files.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational
2. Complete Phase 3: User Story 1
3. **STOP and VALIDATE**: run `npm test`; manually exercise `tome_remove_source` against a real added source
4. This alone closes the feature's headline gap — "the only way to undo adding a source is deleting the whole index file" — even before US2/US3 land

### Incremental Delivery

1. Foundational → interface + in-memory double ready
2. Add User Story 1 → test independently → MVP: removal works for the common case
3. Add User Story 2 → test independently → nonexistent-id removal is provably safe, not just assumed
4. Add User Story 3 → test independently → the in-flight-job race (and its `search()` crash risk) is closed and proven closed
5. Polish → real-plugin manual check + full regression run

---

## Notes

- [P] tasks = different files, no dependency on an unfinished sibling in the same batch
- [Story] label maps task to specific user story for traceability
- No `[US]` label on Foundational, Setup, or Polish tasks, per the format rules
- As in milestones 001–004, implementation and its test live in the same
  task rather than a strict red-green TDD split across separate tasks —
  T003/T008, T004/T005, T006/T009, T007/T010, and T014/T015 are each one
  implement-then-prove unit
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently

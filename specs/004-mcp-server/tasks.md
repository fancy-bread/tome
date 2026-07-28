---
description: "Task list for MCP Server"
---

# Tasks: MCP Server

**Input**: Design documents from `/specs/004-mcp-server/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: This milestone's two headline claims — "the server actually
advertises its tools" (SC-001) and "the full sequence works over real
MCP calls" (SC-002) — are both proven by tests, same as milestones
001–003. Test tasks here are the primary validation mechanism, not
optional scaffolding.

**Organization**: Tasks are grouped by user story from spec.md. All five
stories converge on one file (`src/mcp/server.ts`, one handler per tool),
so — as in every prior milestone — "independent stories" means
independently *testable*, not independently *file-isolated*. Both test
tiers (fast, Phase 2's harness; slow, Phase 8's end-to-end) use a real
connected MCP client+server pair — they differ in which `DocumentIndex`
backs the server and how much of one sequence they exercise, not in
"real protocol vs. fake."

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Paths are relative to repo root

## Phase 1: Setup

**Purpose**: Add the dependency this milestone needs, and resolve research.md's open verification items

- [X] T001 Add `@modelcontextprotocol/sdk` as a runtime dependency in `package.json`; run `npm install`. Confirm against the installed version: (a) whether the higher-level `McpServer`/`registerTool`-style API or the lower-level `Server` + raw request-handler API is the better fit, and (b) whether the SDK ships an in-memory linked client/server transport for tests (research.md's open items — resolve them here, the same way milestone 002 resolved `pdf-parse`'s real API and milestone 003 resolved `sqlite-vec`'s real bind types, by writing a throwaway script against the real package before committing to `server.ts`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The tool definitions, server skeleton, and test-connection harness every user story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Define `src/mcp/tool-descriptions.ts`: the four `ToolDefinition` objects (name, description, inputSchema) per `specs/004-mcp-server/contracts/tools.ts`, including the crafted `tome_search`/`tome_fetch` description text (Constitution Principle III) verbatim from research.md
- [X] T003 Define `src/mcp/server.ts`: `createTomeServer(index: DocumentIndex)` per T001's confirmed API — construct the server, register the four tools from `tool-descriptions.ts` with stub handlers that throw, and a single shared try/catch wrapper every handler will use (FR-008) mapping any thrown error to `{ isError: true, content: [{ type: 'text', text: err.message }] }` (depends on T001, T002)
- [X] T004 Create `tests/mcp/test-client.ts`: a shared helper, `connectTestClient(index: DocumentIndex)`, that builds a server via `createTomeServer` and returns a connected MCP client using whichever transport T001 identified (in-memory preferred for speed) — used by every test file below (depends on T003)

**Checkpoint**: A test client can connect to a server built from any `DocumentIndex` and receive *some* response (even if tool calls still throw "not implemented") — user story implementation can begin

---

## Phase 3: User Story 1 — Start the Daemon and Discover Its Tools (Priority: P1) 🎯 MVP

**Goal**: A connecting MCP client can discover all four tools, and the real daemon process is startable

**Independent Test**: Start the server, connect a client over stdio, list the tools it advertises; confirm all four appear with descriptions and schemas

### Implementation for User Story 1

- [X] T005 [US1] Implement `src/index.ts`, the daemon entry point: a `resolveDbPath(env: NodeJS.ProcessEnv)` function returning `${env.CLAUDE_PLUGIN_DATA_DIR}/index.db` when set, else a fixed default (`~/.claude/plugins/tome/index.db`, creating the directory if needed); construct a real `SqliteDocumentIndex` with an inline no-op `Embedder` (`embed()` always resolves `null` — no new `src/embedding/` module, per research.md); build the server via `createTomeServer`; connect a `StdioServerTransport` (depends on T003)
- [X] T006 [US1] Write a unit test for `resolveDbPath` in `tests/mcp/server.test.ts` (or a colocated test file): confirms the `CLAUDE_PLUGIN_DATA_DIR` and fallback-default branches both resolve correctly, without needing to start the full daemon (depends on T005)
- [X] T007 [US1] Write User Story 1's two acceptance scenarios in `tests/mcp/server.test.ts` using `connectTestClient` (T004) against `createTomeServer(new InMemoryDocumentIndex())`: a tool-list request returns all four tools with names, descriptions, and input schemas; the server remains available and responsive to a later tool-list request with no tool calls made in between (depends on T004)

**Checkpoint**: A client can discover all four tools; the daemon entry point itself is implemented and unit-testable independent of any specific tool's behavior

---

## Phase 4: User Story 2 — Add a Source via MCP (Priority: P1)

**Goal**: `tome_add_source` registers a source through the index and returns its identifier and status

**Independent Test**: Call `tome_add_source` with a valid source; confirm the response includes an identifier and pending/indexing status

### Implementation for User Story 2

- [X] T008 [US2] Implement the `tome_add_source` handler in `server.ts`: parse `{ type, origin }` from the tool call arguments, call `index.addSource({ type, origin })`, map the returned `Source` to `{ sourceId, status }` (FR-003) (depends on T004)
- [X] T009 [US2] Write User Story 2's three acceptance scenarios in `tests/mcp/server.test.ts`: a valid call returns an identifier and pending/indexing status; calling it again with an already-added origin reflects a refresh of the same source, not a new one; a call missing a required argument returns `isError: true` (FR-009) (depends on T008)

**Checkpoint**: Sources can be added over MCP, independent of search/fetch/list

---

## Phase 5: User Story 3 — Search Indexed Content via MCP (Priority: P1)

**Goal**: `tome_search` returns ranked results with source metadata, and its description drives proactive use

**Independent Test**: Add a source, wait for it to index, search for known text, confirm ranked results with source metadata come back

### Implementation for User Story 3

- [X] T010 [US3] Implement the `tome_search` handler in `server.ts`: parse `{ query, limit?, sourceId? }`, call `index.search(query, { limit, sourceId })`, map each `RankedChunk` to `{ chunkId, text, sourceId, uri, title, score, rankedBy }` per data-model.md (FR-004) (depends on T004)
- [X] T011 [US3] Write User Story 3's three acceptance scenarios in `tests/mcp/server.test.ts`: a query with relevant indexed content (seeded via `InMemoryDocumentIndex`'s seed methods) returns ranked results with source metadata; a query matching nothing returns an empty array, not an error; `TOME_SEARCH.description` (imported directly from `tool-descriptions.ts`, no live call needed) contains explicit proactive-use language, e.g. "Call this proactively" (FR-010, SC-005). If T001 found the SDK does *not* auto-validate `inputSchema`, also add: a call missing `query` returns `isError: true` (FR-009) (depends on T010)

**Checkpoint**: Search works over MCP against seeded content, independent of add/fetch/list

---

## Phase 6: User Story 4 — Retrieve Content by Identifier via MCP (Priority: P1)

**Goal**: `tome_fetch` returns full content by id, or a structured error that doesn't take the server down

**Independent Test**: Fetch a known id and confirm full content; fetch an unknown id and confirm `isError: true` with the server still responsive afterward

### Implementation for User Story 4

- [X] T012 [US4] Implement the `tome_fetch` handler in `server.ts`: parse `{ id }`, call `index.fetch(id)`, discriminate the result — `{ id, type: 'chunk', text, documentId, ordinal }` for a `Chunk`, `{ id, type: 'document', uri, title, sourceId }` for a `Document` (FR-005) — and let a caught `NotFoundError` flow through the shared error wrapper (FR-007) (depends on T004)
- [X] T013 [US4] Write User Story 4's three acceptance scenarios in `tests/mcp/server.test.ts`: a known chunk id returns its full text; an unknown id returns `isError: true`, and a subsequent, unrelated tool call in the same client session still succeeds (FR-007, SC-003); `TOME_FETCH.description` contains explicit proactive-use language matching `tome_search`'s pattern (FR-010, SC-005). If T001 found the SDK does *not* auto-validate `inputSchema`, also add: a call missing `id` returns `isError: true` (FR-009) (depends on T012)

**Checkpoint**: Fetch works over MCP with correct error isolation, independent of add/search/list

---

## Phase 7: User Story 5 — List Sources via MCP (Priority: P2)

**Goal**: `tome_list_sources` returns every source's real, current status

**Independent Test**: Add two sources, call `tome_list_sources`, confirm both appear with accurate status

### Implementation for User Story 5

- [X] T014 [US5] Implement the `tome_list_sources` handler in `server.ts`: call `index.listSources()`, map to `{ sources: [{ id, type, origin, status, lastIndexedAt, error }] }` per data-model.md — no `documentCount`/`chunkCount` (FR-006) (depends on T004)
- [X] T015 [US5] Write User Story 5's acceptance scenario in `tests/mcp/server.test.ts`: sources seeded in different states (via `InMemoryDocumentIndex`'s seed methods) all appear with their real status and last-indexed time (depends on T014)

**Checkpoint**: All five user stories independently pass — this is the full scope of milestone 004

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The one behavior no single-tool test proves, plus final validation

- [X] T016 Write `tests/mcp/end-to-end.test.ts` (SC-002): using `connectTestClient` against `createTomeServer(new SqliteDocumentIndex({ dbPath: ':memory:', embedder }))`, run the full sequence — `tome_add_source` → poll/wait for indexing to settle → `tome_search` → `tome_fetch` a result's id → `tome_list_sources` — entirely through MCP tool calls, confirming accurate results at each step (depends on T009, T011, T013, T015)
- [X] T017 Add a cross-cutting test to `end-to-end.test.ts` or `server.test.ts` for FR-008's *generic* case (distinct from US4's `NotFoundError`-specific check in T013): construct a `DocumentIndex` whose `search()` throws a plain `Error` (not `NotFoundError`), confirm `tome_search` returns `isError: true` and a subsequent `tome_list_sources` call in the same session still succeeds (depends on T016)
- [X] T018 Write an automated stdio-transport connectivity test (e.g. `tests/mcp/stdio.test.ts`): `beforeAll` runs `npm run build` (via `child_process.execSync` or equivalent), then connects the SDK's real `StdioClientTransport` to a spawned `node dist/index.js` process — not the in-memory transport T004's other tests use — and confirms a single `tools/list` round trip returns all four tools. This is what makes FR-001's stdio-specific claim CI-enforced rather than only checked by T021's manual smoke test; kill the spawned process in `afterAll` (depends on T005)
- [X] T019 Run `npx tsc --noEmit` from repo root and resolve any type errors across `src/mcp/`, `src/index.ts`, and `tests/mcp/` (depends on T017, T018)
- [X] T020 Run `npm run test:coverage` and confirm every test passes and the repo-wide coverage gate (statements/functions/lines 95%, branches 90%) still holds with the new `src/mcp/` and `src/index.ts` code included — close any real gap with a test, don't lower the threshold, per precedent from milestones 002 and 003 (depends on T019)
- [X] T021 Run quickstart.md's manual smoke test (`npm run build && node dist/index.js`) to confirm the real daemon entry point actually boots, as a final sanity check beyond the in-process test harness (depends on T020)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–7)**: All depend on Foundational; independently testable via `connectTestClient` once it exists
- **Polish (Phase 8)**: Depends on all five user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories
- **User Story 2 (P1)**: No dependency on other stories
- **User Story 3 (P1)**: No dependency on other stories
- **User Story 4 (P1)**: No dependency on other stories
- **User Story 5 (P2)**: No dependency on other stories

### Within Each User Story

- Implementation (the tool's handler) before its acceptance-scenario tests
- Story complete and checkpointed before moving to the next

### Parallel Opportunities

- T002 (tool-descriptions.ts) has no dependency on T001's API-shape verification and can be drafted in parallel with it, though T003 (server.ts) can't start until both land
- Once Foundational (T002–T004) completes, US2/US3/US4/US5's handler implementations (T008, T010, T012, T014) touch different tool-handler functions in the same `server.ts` file and different assertions in the same `server.test.ts` file — parallelizable in principle by different contributors, same convergence caveat as every prior milestone

---

## Parallel Example: Foundational Phase

```bash
# T002 can start immediately; T001's verification blocks T003 regardless:
Task: "Define src/mcp/tool-descriptions.ts"
Task: "Verify @modelcontextprotocol/sdk's tool-registration API and test-transport options"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Start the Daemon and Discover Its Tools)
4. **STOP and VALIDATE**: a client can discover all four tools; `src/index.ts` boots via the manual smoke test
5. This proves the actual "first real vertical slice" the roadmap names before investing in each tool's specific behavior

### Incremental Delivery

1. Setup + Foundational → server compiles, test harness connects
2. Add US1 → validate → tools discoverable, daemon boots
3. Add US2 → validate → sources addable over MCP
4. Add US3 → validate → search works, description text proven
5. Add US4 → validate → fetch works, error isolation proven
6. Add US5 → validate → all four tools complete
7. Polish → the one full real-SqliteDocumentIndex sequence (SC-002), generic error-isolation, type-check, coverage gate, manual smoke test

## Notes

- US2–US5 converge on `server.ts` because they're all tool handlers
  registered by one `createTomeServer` function — expected, not a sign
  the stories aren't independent, same pattern as every prior milestone.
- No task in this file touches `src/embedding/` (doesn't exist yet — the
  no-op embedder in T005 is a small inline class, not a new module, per
  research.md) or any skill-file/plugin-packaging concern (milestones
  006–007).
- Commit after each checkpoint (end of each phase).

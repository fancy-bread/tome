---
description: "Task list for Claude Code Plugin Packaging"
---

# Tasks: Claude Code Plugin Packaging

**Input**: Design documents from `/specs/007-plugin-packaging/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Structural/content validation of the three new JSON config
files and the corrected environment variable are automated; whether the
real Claude Code harness actually runs the hook, injects the variables,
and starts the server correctly is a live-session concern covered by
quickstart.md's manual smoke test, not `vitest` — the same limitation
milestone 006 accepted for its skill files.

**Organization**: Tasks are grouped by user story from spec.md.
Foundational work is the real environment-variable bug fix
(research.md #3) both user stories depend on.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US2)
- Paths are relative to repo root

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Fix the real `CLAUDE_PLUGIN_DATA` bug both user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 Fix `src/index.ts`: rename `CLAUDE_PLUGIN_DATA_DIR` to `CLAUDE_PLUGIN_DATA` in `resolveDbPath` (the env key it reads) and its JSDoc comment — the real Claude Code environment variable has no `_DIR` suffix; as shipped, an installed Tome would silently never use the harness's durable directory (research.md #3, data-model.md)
- [X] T002 Update `tests/mcp/index.test.ts`: rename `CLAUDE_PLUGIN_DATA_DIR` to `CLAUDE_PLUGIN_DATA` in both existing test cases' env object and descriptions (depends on T001 — the existing tests currently pass against the wrong variable name and must be corrected together with the fix, not left green by accident)

**Checkpoint**: The real bug is fixed and proven — every subsequent task can rely on the correct variable name

---

## Phase 2: User Story 1 — Install Tome with One Command and Have It Just Work (Priority: P1) 🎯 MVP

**Goal**: A plugin manifest, MCP server declaration, and build hook exist so `claude plugin install` (or `--plugin-dir` for local testing) makes all four MCP tools and all three skill commands available with no manual step

**Independent Test**: Install the plugin into a clean Claude Code environment; confirm all four MCP tools and all three skill commands work with no manual build/config step

### Implementation for User Story 1

- [X] T003 [US1] Create `.claude-plugin/plugin.json` per data-model.md and `contracts/plugin-packaging.ts`'s `PluginManifest`: `name: "tome"`, a `description`, `version: "0.1.0"`, and an `author` (FR-001, FR-006)
- [X] T004 [US1] Create `.mcp.json` per data-model.md and `contracts/plugin-packaging.ts`'s `McpConfig`: `mcpServers.tome` with `type: "stdio"`, `command: "node"`, `args: ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"]`, and `env: { "CLAUDE_PLUGIN_DATA": "${CLAUDE_PLUGIN_DATA}" }` (FR-001, FR-004; research.md #1, #3) (depends on T001)
- [X] T005 [US1] Create `hooks/hooks.json` per data-model.md and `contracts/plugin-packaging.ts`'s `HooksConfig`: a `SessionStart` entry whose `command` skips the build if `${CLAUDE_PLUGIN_ROOT}/dist/index.js` already exists, else runs `cd "${CLAUDE_PLUGIN_ROOT}" && npm install && npm run build`; `async: true`; a `statusMessage` (FR-003; research.md #2)
- [X] T006 [US1] Add a "Troubleshooting" section to `README.md`: if the MCP tools or skill commands don't appear after installing, tells the user to run `claude --debug` to see MCP server initialization errors — the only way Claude Code surfaces this class of failure, since it isn't displayed proactively (FR-007; research.md #6)

### Tests for User Story 1

- [X] T007 [US1] Write `tests/plugin/plugin-config.test.ts`: parse `.claude-plugin/plugin.json` and assert `name`/`description` per `EXPECTED` in `contracts/plugin-packaging.ts`; parse `.mcp.json` and assert the `tome` server's `type`/`command`/`args`/`env` fields match `EXPECTED`; parse `hooks/hooks.json` and assert a `SessionStart` entry exists whose `command` contains both `npm install` and `npm run build`, guarded by an idempotency check, with `async: true`. Also add a live-session-independent proxy for FR-002/SC-001 (since T009 below may not always run): import `TOME_SEARCH`, `TOME_FETCH`, `TOME_LIST_SOURCES`, `TOME_ADD_SOURCE` from `src/mcp/tool-descriptions.ts` and assert exactly those four tool names exist; count `skills/*/SKILL.md` directories and assert exactly three (`add`, `sources`, `search`) — not proof the live harness works, but proof every ingredient FR-002 depends on is present and correctly named regardless of whether the manual smoke test below gets run (depends on T003, T004, T005)
- [X] T008 [US1] Extend `tests/plugin/plugin-config.test.ts` (or add a sibling test) asserting `README.md` contains troubleshooting guidance mentioning `claude --debug` (FR-007) (depends on T006)
- [X] T009 [US1] Run quickstart.md's manual smoke test's install/discovery portion: `claude --plugin-dir <this-repo>`, `/reload-plugins`, confirm all four MCP tools and `/tome:add`, `/tome:sources`, `/tome:search` are available and functional — including observing the `SessionStart` hook's first-run build if `dist/` doesn't already exist (depends on T007, T008) — **Outcome**: skipped by user choice, matching milestones 005 (T016) and 006 (T010) — running it means spawning a nested live Claude Code session incurring real API usage. Explicitly recorded as skipped, not passed — no bearing on T001–T008's automated coverage, including the FR-002/SC-001 proxy check.

**Checkpoint**: The plugin installs and works end-to-end for the first time

---

## Phase 3: User Story 2 — Indexed Content Persists Across Sessions (Priority: P2)

**Goal**: Content indexed in one session is still there in the next, because the installed server actually uses the harness's durable data directory

**Independent Test**: Install the plugin, add a source, close and reopen the session, confirm the source and its content are still there without re-adding it

### Implementation for User Story 2

No new implementation — this story is entirely a consequence of Foundational's `CLAUDE_PLUGIN_DATA` fix (T001) and User Story 1's `.mcp.json` env-forwarding (T004). This story is proven, not built.

### Tests for User Story 2

- [X] T010 [US2] Run quickstart.md's manual smoke test's persistence portion: after T009's session, add a source, close the session, reopen with the same `--plugin-dir`, and confirm `/tome:sources` still lists it without re-adding (FR-004, SC-002) (depends on T009). **Scope note**: this exercises a session restart, not a real plugin reinstall/update — `--plugin-dir` dev-mode has no separate "reinstall" step to simulate. SC-003 (reinstalling/updating preserves data) is accepted as verified by construction only — `CLAUDE_PLUGIN_DATA` is documented by Claude Code itself as a directory that "survives plugin updates" (research.md #3) — not exercised directly by any task this milestone. — **Outcome**: skipped by user choice alongside T009, for the same reason (avoiding an unprompted nested live session with real API usage).

**Checkpoint**: Both user stories independently pass — full milestone scope, and the v1 MVP roadmap's final milestone

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across the whole milestone

- [X] T011 Run `npx tsc --noEmit` from repo root (depends on T002, T007, T008)
- [X] T012 Run `npm run test:coverage`; confirm every test passes and the repo-wide coverage gate still holds — no new `src/` coverage surface beyond the one already-tested line in `index.ts` (depends on T011)
- [X] T013 Run `npm run build` once locally to confirm `dist/` builds cleanly — a sanity check that the exact command the `SessionStart` hook runs actually works, independent of the real harness (depends on T012)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately; BLOCKS all user stories
- **User Story 1 (Phase 2)**: Depends on Foundational
- **User Story 2 (Phase 3)**: Depends on Foundational and User Story 1 (its `.mcp.json` env forwarding)
- **Polish (Phase 4)**: Depends on both user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (T001). No dependency on other stories.
- **User Story 2 (P2)**: Depends on Foundational (T001) and User Story 1 (T004's `env` forwarding) — no new production code of its own, same pattern as milestone 006's US2 and milestone 005's US2.

### Within Each User Story

- Implementation before its validation tests
- Story complete and checkpointed before moving to the next

### Parallel Opportunities

- T003, T004, T005 (the three new config files) can be drafted in parallel — different files, no shared state, though T003/T004/T005 all feed into T007's validation test
- T001 and T002 are sequential, not parallel, despite touching different files: T002 corrects the existing tests to match T001's fix, and would fail if done first

---

## Parallel Example: User Story 1 Implementation

```bash
# All three config files can be written in parallel once Foundational lands:
Task: "Create .claude-plugin/plugin.json"
Task: "Create .mcp.json"
Task: "Create hooks/hooks.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (the real `CLAUDE_PLUGIN_DATA` fix)
2. Complete Phase 2: User Story 1 (manifest, `.mcp.json`, hook)
3. **STOP and VALIDATE**: install/`--plugin-dir` works, all seven capabilities reachable
4. This proves the milestone's headline claim — "one command, everything works" — before validating cross-session persistence

### Incremental Delivery

1. Foundational → the bug that would have silently broken FR-004 is fixed and proven
2. Add US1 → validate → plugin installs and works (MVP!)
3. Add US2 → validate → content survives a session restart
4. Polish → type-check, coverage gate, a local build sanity check

## Notes

- This is the final milestone on the v1 MVP roadmap (001–007). No
  further milestone depends on this one.
- T009 and T010 are live Claude Code sessions, not `vitest` runs —
  consistent with milestone 005's T016 and milestone 006's T010, these
  may involve real API usage and should be confirmed with the user
  before running, rather than assumed passing if skipped.
- SC-003 (reinstall/update preserves data) and SC-004 (startup-failure
  visibility) are both accepted as verified by construction/documentation
  rather than by a task that directly exercises them — see T010's scope
  note and T006/T008 respectively. Both corrections were made during
  `/speckit-analyze`, not the original planning pass — see research.md
  #6 for the full record.
- Commit after each checkpoint (end of each phase).

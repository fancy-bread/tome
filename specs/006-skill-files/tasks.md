---
description: "Task list for Skill Files"
---

# Tasks: Skill Files

**Input**: Design documents from `/specs/006-skill-files/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Each skill's frontmatter and body content is validated by
tests reading the real `SKILL.md` file from disk, the same
content-assertion approach milestone 004 used for MCP tool descriptions.
This is the ceiling of what's automatable here — whether an agent
actually *behaves* as instructed is a live-session concern, covered by
quickstart.md's manual smoke test, not `vitest`.

**Organization**: Tasks are grouped by user story from spec.md. No
Setup phase — this milestone adds no dependency, no build/lint config
change, and no `src/` code at all. Foundational work is the shared
frontmatter-parsing test helper every story's tests use.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Paths are relative to repo root

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: A shared way to read and validate a `SKILL.md` file's structure

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 [P] Create `tests/skills/parse-skill-file.ts`: a small helper, `parseSkillFile(path: string)`, that reads a `SKILL.md` file, splits the frontmatter (the content between the first two `---` lines) from the body, and parses the frontmatter's flat scalar keys (`name`, `description`, `argument-hint`, `disable-model-invocation`) via simple line-splitting — no YAML library, since nothing nested is involved (research.md #2, per `contracts/skill-file.ts`'s `SkillFrontmatter` shape)

**Checkpoint**: Every story's tests can now assert against real parsed file content

---

## Phase 2: User Story 1 — Explicitly Add a Source via a Slash Command (Priority: P1) 🎯 MVP

**Goal**: `/tome-add` exists, is correctly structured, and its body correctly instructs calling `tome_add_source` with clarification and failure handling

**Independent Test**: Parse `skills/tome-add/SKILL.md` and confirm its structure per data-model.md; manually invoke `/tome-add` in a `--plugin-dir` session

### Implementation for User Story 1

- [X] T002 [US1] Write `skills/tome-add/SKILL.md` per data-model.md and `contracts/skill-file.ts`: frontmatter with `name: tome-add`, a `description`, an `argument-hint` (e.g. `<type> <origin>`), and `disable-model-invocation: true`; body containing the `$ARGUMENTS` placeholder and instructions to call `tome_add_source` with the parsed type and origin (FR-002), to ask the user for clarification when either is missing or malformed rather than guessing (FR-006), and to surface a failed tool call readably (FR-009)

### Tests for User Story 1

- [X] T003 [US1] Write `tests/skills/skill-files.test.ts`'s `tome-add` scenarios: frontmatter has `name: 'tome-add'`, a non-empty `description`, and `disable-model-invocation: true`; body contains `$ARGUMENTS` and the literal string `tome_add_source`; body instructs asking for clarification on a missing argument; body instructs surfacing a failed tool call readably (FR-009) (depends on T001, T002)

**Checkpoint**: `/tome-add` is real, tested, and correctly targets its MCP tool

---

## Phase 3: User Story 2 — Check What's Indexed via a Slash Command (Priority: P2)

**Goal**: `/tome-sources` exists and correctly instructs calling `tome_list_sources`

**Independent Test**: Parse `skills/tome-sources/SKILL.md`; manually invoke `/tome-sources`

### Implementation for User Story 2

- [X] T004 [US2] Write `skills/tome-sources/SKILL.md`: frontmatter with `name: tome-sources`, a `description`, and `disable-model-invocation: true` (no `argument-hint` — this command takes no arguments); body instructing the agent to call `tome_list_sources` and present every source's type, origin, status, and last-indexed time (FR-003), including the zero-sources case (report nothing indexed yet, not an error), and to surface a failed tool call readably (FR-009)

### Tests for User Story 2

- [X] T005 [US2] Write `tests/skills/skill-files.test.ts`'s `tome-sources` scenarios: frontmatter has `name: 'tome-sources'`, a non-empty `description`, and `disable-model-invocation: true`; body contains the literal string `tome_list_sources`; body instructs reporting that nothing is indexed yet (not an error) when the source list is empty; body instructs surfacing a failed tool call readably (FR-009) (depends on T001, T004)

**Checkpoint**: `/tome-sources` is real, tested, independent of `/tome-add`

---

## Phase 4: User Story 3 — Manually Query the Index via a Slash Command (Priority: P3)

**Goal**: `/tome-search` exists and correctly instructs calling `tome_search`

**Independent Test**: Parse `skills/tome-search/SKILL.md`; manually invoke `/tome-search`

### Implementation for User Story 3

- [X] T006 [US3] Write `skills/tome-search/SKILL.md`: frontmatter with `name: tome-search`, a `description`, an `argument-hint` (e.g. `<query>`), and `disable-model-invocation: true`; body containing the `$ARGUMENTS` placeholder and instructions to call `tome_search` with the parsed query (FR-004), to ask the user for a query when none was given rather than running an empty search (FR-007), to report "no results" rather than an error when nothing matches, and to surface a failed tool call readably (FR-009)

### Tests for User Story 3

- [X] T007 [US3] Write `tests/skills/skill-files.test.ts`'s `tome-search` scenarios: frontmatter has `name: 'tome-search'`, a non-empty `description`, and `disable-model-invocation: true`; body contains `$ARGUMENTS` and the literal string `tome_search`; body instructs asking for a query when none is given; body instructs reporting "no results" (not an error) when nothing matches; body instructs surfacing a failed tool call readably (FR-009) (depends on T001, T006)

**Checkpoint**: All three skills independently pass — full milestone scope

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across the whole milestone

- [X] T008 Run `npx tsc --noEmit` from repo root — only `tests/skills/*.ts` is new TypeScript this milestone; `skills/*/SKILL.md` files are content, not compiled (depends on T003, T005, T007)
- [X] T009 Run `npm run test:coverage`; confirm the gate still passes. No `src/` code changed this milestone, so no new coverage surface exists to create a gap (depends on T008)
- [X] T010 Run quickstart.md's manual smoke test: `claude --plugin-dir <this-repo>`, `/reload-plugins`, then exercise `/tome-add`, `/tome-sources`, and `/tome-search`, including invoking `/tome-add` and `/tome-search` with no arguments to confirm they prompt for what's missing rather than erroring (depends on T009) — **Outcome**: skipped by user choice, matching milestone 005's T016 precedent — running it means spawning a nested live Claude Code session incurring real API usage, which wasn't taken unprompted. Explicitly recorded as skipped, not passed — no bearing on T001–T009's automated coverage of every skill's structure and content.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately; BLOCKS all user stories
- **User Stories (Phases 2–4)**: All depend on Foundational only; fully independent of each other
- **Polish (Phase 5)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (T001). No dependency on other stories.
- **User Story 2 (P2)**: Depends on Foundational (T001). No dependency on other stories.
- **User Story 3 (P3)**: Depends on Foundational (T001). No dependency on other stories.

### Within Each User Story

- Implementation (the `SKILL.md` file) before its validation tests
- Story complete and checkpointed before moving to the next

### Parallel Opportunities

- T001 has no dependents until it's done, but every story's implementation task (T002, T004, T006) can be drafted in parallel with each other once T001 lands — three different files, no shared state
- All three stories are fully independent of one another, unlike milestone 004's tool handlers (which converged on one `server.ts`) — these are three separate `SKILL.md` files with no shared code

---

## Parallel Example: After Foundational

```bash
# All three skill files can be written in parallel — different files, no shared state:
Task: "Write skills/tome-add/SKILL.md"
Task: "Write skills/tome-sources/SKILL.md"
Task: "Write skills/tome-search/SKILL.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (parsing helper)
2. Complete Phase 2: User Story 1 (`/tome-add`)
3. **STOP and VALIDATE**: `/tome-add` works end-to-end in a real `--plugin-dir` session
4. This proves the pattern — a skill file correctly instructing a call to an existing MCP tool — before repeating it twice more

### Incremental Delivery

1. Foundational → parsing helper ready
2. Add US1 → validate → `/tome-add` works (MVP!)
3. Add US2 → validate → `/tome-sources` works, independent of US1
4. Add US3 → validate → `/tome-search` works, independent of US1/US2
5. Polish → type-check, coverage gate (unaffected), manual smoke test of all three together

## Notes

- No task touches `src/` — this milestone's entire deliverable is three
  content files plus their tests, per plan.md's Constitution Check
  (Principle V: no new dependency, no configuration surface).
- `tests/skills/skill-files.test.ts` is shared across all three stories
  (one file, multiple scenarios) — expected, same pattern as
  `tests/mcp/server.test.ts` (milestone 004) and
  `tests/storage/reconciliation.test.ts` (milestone 005).
- Commit after each checkpoint (end of each phase).

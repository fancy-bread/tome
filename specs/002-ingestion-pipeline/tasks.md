---
description: "Task list for Ingestion Pipeline (Crawler + Chunker)"
---

# Tasks: Ingestion Pipeline (Crawler + Chunker)

**Input**: Design documents from `/specs/002-ingestion-pipeline/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: This feature's deliverable is validated the same way milestone
001's was — the test suite IS the proof the contracts work, not optional
scaffolding, since crawler/chunker have no other caller yet.

**Organization**: Tasks are grouped by user story from spec.md. Unlike
milestone 001 (one interface, four methods, everything converging on two
files), this milestone has two genuinely independent tracks: **Crawler**
(US1/US2/US3/US5, all landing in `src/ingestion/crawler.ts`) and
**Chunker** (US4, landing in `src/ingestion/chunker.ts`) — these two files
never touch each other and can be built in parallel. Within the Crawler
track, US1/US2/US3 share one file (their dispatch branches in
`DefaultCrawler`), so — as with milestone 001 — "independent stories"
means independently *testable*, not independently *file-isolated*.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Paths are relative to repo root

## Phase 1: Setup

**Purpose**: Add the dependencies this milestone needs beyond milestone 001's baseline

- [X] T001 Add `cheerio`, `turndown`, `pdf-parse`, `simple-git` as runtime dependencies and `@types/turndown` (plus a local ambient declaration for `pdf-parse` if no `@types` package exists) as dev dependencies in `package.json`; run `npm install`
- [X] T002 [P] Add a small real PDF fixture at `tests/ingestion/fixtures/sample.pdf` for `pdf-parse` to run against

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared helpers and the `Crawler` contract every crawl-related story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Implement the content-fingerprint helper in `src/ingestion/hash.ts` — SHA-256 over extracted text, per `contracts/crawler.ts`'s `Document.contentHash` usage and research.md (used by US1, US2, US3, US5)
- [X] T004 [P] Implement the title-extraction helper in `src/ingestion/title.ts` — first Markdown-style heading (`# ...`) in extracted text, or `null` (used by US1, US2, US3)
- [X] T005 [P] Implement the shared directory-walking helper in `src/ingestion/walk-directory.ts` — `fs.promises.readdir(path, { recursive: true, withFileTypes: true })`, filtered to `.md`/`.txt`/`.pdf` (used by US2, US3 — this is what makes FR-005's "same file types as a local path source" provably true rather than duplicated)
- [X] T006 Define the `Crawler` interface and `CrawlBounds`/`CrawlInput`/`CrawledDocument`/`CrawlResult` types in `src/ingestion/crawler.ts`, plus a `DefaultCrawler` class skeleton with stub dispatch branches for `'url'`/`'path'`/`'git'`, per `specs/002-ingestion-pipeline/contracts/crawler.ts` (depends on T003, T004, T005 existing to be called from the dispatch branches filled in later)

**Checkpoint**: `Crawler` contract compiles, shared helpers ready — user story implementation can begin

---

## Phase 3: User Story 1 — Crawl a URL Source (Priority: P1) 🎯 MVP

**Goal**: Point the crawler at a URL and get back a `Document` for every page within the same origin/path prefix, bounded by depth and page count

**Independent Test**: Crawl a small bounded fixture site; confirm in-scope pages are returned, an off-origin page is excluded, and a site sized to exceed the bounds still returns a partial, non-erroring result

### Implementation for User Story 1

- [X] T007 [US1] Implement the `'url'` dispatch branch in `DefaultCrawler` (`src/ingestion/crawler.ts`): fetch via global `fetch`, parse HTML via `cheerio`, convert to Markdown via `turndown`, extract and filter links to the same origin + path prefix (FR-001), breadth-first traversal bounded by `maxDepth` (default 3) and `maxPageCount` (default 200) — stopping at whichever is hit first (FR-002, FR-003), skip-and-continue on a single page fetch/parse failure (FR-007), surface an unfetchable starting URL via `CrawlResult.error` (FR-008), populate `contentHash` (T003) and `title` (T004) per Document (depends on T006)
- [X] T008 [US1] Write `tests/ingestion/url-crawler.test.ts`: a local `http.createServer` fixture serving a small linked site (including one off-origin/off-prefix link and one broken link), covering US1's three acceptance scenarios plus SC-001/SC-002, and asserting on the broken-link fixture specifically that the rest of the site's Documents are still returned (SC-005) (depends on T007)

**Checkpoint**: URL crawling fully verified, independent of path/git crawling or chunking

---

## Phase 4: User Story 2 — Crawl a Local Path Source (Priority: P1)

**Goal**: Point the crawler at a local directory and get back a `Document` for every matching file

**Independent Test**: Crawl a temp directory containing a mix of `.md`/`.txt`/`.pdf` and non-matching files; confirm only matching files (including in subdirectories) produce Documents

### Implementation for User Story 2

- [X] T009 [US2] Implement the `'path'` dispatch branch in `DefaultCrawler` (`src/ingestion/crawler.ts`) using `walk-directory.ts` (T005): read `.md`/`.txt` as UTF-8 text, extract `.pdf` text via `pdf-parse`, populate `contentHash`/`title` per Document, skip-and-continue on a single file read/parse failure (FR-007, SC-005). Catch a nonexistent-or-unreadable root path (`walk-directory.ts` throwing, e.g. `ENOENT`/`EACCES`) and surface it via `CrawlResult.error` instead of letting the exception propagate — this is a named Constitution Principle II case ("invalid path"), the same category as an unreachable URL or unclonable repo (FR-008) (depends on T006)
- [X] T010 [US2] Write `tests/ingestion/path-crawler.test.ts`: temp-directory fixtures covering US2's three acceptance scenarios — matching files incl. subdirectories → Documents; non-matching files excluded; a nonexistent path → `CrawlResult.error` set, zero Documents, no thrown exception (FR-008) — plus one unreadable/corrupt file among otherwise-valid fixtures to confirm the rest are still returned (SC-005), using `fixtures/sample.pdf` (T002) for the PDF case (depends on T009)

**Checkpoint**: Path crawling fully verified, independent of URL/git crawling or chunking

---

## Phase 5: User Story 3 — Crawl a Git Repository Source (Priority: P1)

**Goal**: Point the crawler at a git repo (URL or existing local clone) and get back a `Document` for every matching file in its working tree

**Independent Test**: Crawl a real local git repository fixture (fresh clone and existing-clone cases); confirm the same Documents a path crawl of that working tree would produce

### Implementation for User Story 3

- [X] T011 [US3] Implement the `'git'` dispatch branch in `DefaultCrawler` (`src/ingestion/crawler.ts`) using `simple-git`: use an existing local clone directly if `origin` already points at one, otherwise clone fresh to a temp directory, then reuse the same file-reading logic as T009 via `walk-directory.ts` (FR-005); surface an unreachable/unclonable repo via `CrawlResult.error` (FR-008) (depends on T006, T009)
- [X] T012 [US3] Write `tests/ingestion/git-crawler.test.ts`: a real local git repository created fresh per test (via `simple-git`/`git init`, no network), covering US3's three acceptance scenarios (fresh clone, existing local clone, unclonable origin), plus one unreadable/corrupt file in the working tree to confirm the rest of the repo's Documents are still returned (SC-005) (depends on T011)

**Checkpoint**: Git crawling fully verified, independent of URL/path crawling or chunking

---

## Phase 6: User Story 4 — Chunk a Document (Priority: P1)

**Goal**: Split a Document's text into overlapping, boundary-aware Chunks with stable ordinals

**Independent Test**: Chunk a multi-section fixture document; confirm boundaries respect headers/paragraphs, adjacent chunks overlap, repeated chunking is stable, and short/empty text are handled correctly

### Implementation for User Story 4

- [X] T013 [P] [US4] Define the `Chunker` interface in `src/ingestion/chunker.ts` per `specs/002-ingestion-pipeline/contracts/chunker.ts` (no dependency on `crawler.ts` — this track is independent of Phases 3–5)
- [X] T014 [US4] Implement `DefaultChunker` in `src/ingestion/chunker.ts`: header/paragraph-aware overlapping split targeting ~500 tokens (`Math.ceil(text.length / 4)` per research.md) with ~15% overlap, stable ordinals across repeated calls on unchanged text (FR-009, FR-010), exactly one chunk for text shorter than the target size, zero chunks for empty text (FR-011) (depends on T013)
- [X] T015 [US4] Write `tests/ingestion/chunker.test.ts` covering US4's five acceptance scenarios (boundary preference, overlap, stability, short-text, empty-text) plus SC-004 (depends on T014)

**Checkpoint**: Chunking fully verified, independent of crawling entirely

---

## Phase 7: User Story 5 — Skip Unchanged Content on Refresh (Priority: P2)

**Goal**: Re-crawling a source produces identical content fingerprints for anything unchanged, and a different one only for what actually changed

**Independent Test**: Crawl the same fixture twice unchanged → identical `contentHash` per Document; change one file/page → only its Document's hash changes

### Tests for User Story 5

- [X] T016 [US5] Write `tests/ingestion/change-detection.test.ts`: crawl each of the URL/path/git fixtures (T007/T009/T011) twice with no changes and assert identical `contentHash` per Document (FR-013, SC-003); modify one fixture file/page between crawls and assert only its Document's hash changes. No new production code — this story's behavior falls entirely out of T003's fingerprint helper already exercised in US1–US3; this task is confirmation, not implementation (depends on T007, T009, T011)

**Checkpoint**: All five user stories independently pass — this is the full scope of milestone 002

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Remaining spec.md Edge Cases spanning multiple stories, and final validation

- [X] T017 Add spec.md's remaining Edge Cases as tests across `tests/ingestion/*.test.ts`: an entirely unfetchable starting URL → zero Documents + `CrawlResult.error` set; an empty local path/git source → zero Documents, `error` stays `null`; a URL source with both bounds configured stops at whichever is hit first (depends on T008, T010, T012)
- [X] T018 Run `npx tsc --noEmit` from repo root and resolve any type errors across `src/ingestion/` and `tests/ingestion/` (depends on T016, T017)
- [X] T019 Run `npm test` and confirm every test passes, covering SC-001 through SC-005 per quickstart.md's Expected Outcome section (depends on T018)
- [X] T020 Run quickstart.md's manual smoke test (crawl the repo itself as a `path` source) as a final sanity check (depends on T019)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001's dependencies must be installed) — BLOCKS all user stories
- **Crawler stories (Phases 3–5, 7)**: All depend on Foundational; US1/US2/US3 are independently testable but share `crawler.ts`; US5 (Phase 7) depends on US1/US2/US3's fixtures existing
- **Chunker story (Phase 6)**: Depends only on Foundational — fully independent of Phases 3–5, 7
- **Polish (Phase 8)**: Depends on all five user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories
- **User Story 2 (P1)**: No dependency on other stories
- **User Story 3 (P1)**: Reuses US2's file-reading logic (T009) via `walk-directory.ts`, but is independently testable against its own git fixture
- **User Story 4 (P1)**: No dependency on any other story — different file (`chunker.ts`) entirely
- **User Story 5 (P2)**: Depends on US1/US2/US3's crawl implementations existing (it tests a property of their output, not new behavior)

### Within Each User Story

- Interface/type definitions before implementation (US4 only — Crawler's interface is already Foundational)
- Implementation before its acceptance-scenario tests
- Story complete and checkpointed before moving to the next

### Parallel Opportunities

- T001 and T002 can run in parallel (unrelated files)
- T003, T004, T005 can run in parallel (independent files, no shared imports)
- **Once Foundational completes, the Crawler track (Phases 3–5) and the Chunker track (Phase 6) can proceed fully in parallel** — they share no files
- Within the Crawler track, T007/T009/T011 all land in `crawler.ts`'s different dispatch branches — parallelizable in principle (different branches) but likely to conflict in practice for a single implementer, same caveat as milestone 001's convergence note
- T013 has no dependency on Foundational's Crawler pieces (T006) and could start as soon as T003–T005 land, though it's gated behind T006 completing in this ordering purely for phase-sequencing clarity, not a real code dependency

---

## Parallel Example: Foundational Phase

```bash
# After T001-T002:
Task: "Implement content-fingerprint helper in src/ingestion/hash.ts"
Task: "Implement title-extraction helper in src/ingestion/title.ts"
Task: "Implement shared directory-walking helper in src/ingestion/walk-directory.ts"
```

## Parallel Example: Crawler Track vs. Chunker Track

```bash
# After Foundational (T003-T006) completes, two independent tracks:

# Track A — Crawler (src/ingestion/crawler.ts, tests/ingestion/{url,path,git}-crawler.test.ts):
Task: "Implement the 'url' dispatch branch in DefaultCrawler"

# Track B — Chunker (src/ingestion/chunker.ts, tests/ingestion/chunker.test.ts):
Task: "Define the Chunker interface in src/ingestion/chunker.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Crawl a URL Source)
4. **STOP and VALIDATE**: `npm test` passes for US1's scenarios alone
5. This proves the `Crawler` contract and URL-fetching path work before investing in path/git/chunking

### Incremental Delivery

1. Setup + Foundational → `Crawler` contract compiles, shared helpers ready
2. Add US1 (URL) → validate → smallest provable crawl slice
3. Add US2 (Path) → validate → reuses nothing from US1, proves the contract generalizes
4. Add US3 (Git) → validate → reuses US2's file-reading logic via `walk-directory.ts`
5. Add US4 (Chunker) → validate → can happen any time after Foundational, in parallel with 2–4
6. Add US5 (change detection) → validate → confirmation pass over US1–US3's existing fingerprinting
7. Polish → remaining edge cases, type-check, full suite green

## Notes

- US1/US2/US3 converge on `crawler.ts` because they're all dispatch
  branches of one `Crawler` interface (a Phase-1 design choice, not a
  spec requirement) — expected, not a sign the stories aren't
  independently testable.
- US4 is the one genuinely parallel track this milestone offers that
  milestone 001 didn't have — `chunker.ts` shares no code or file with
  `crawler.ts`.
- No task in this file touches `src/storage/`, `src/mcp/`, or
  `src/embedding/` — those belong to milestones 003–005 per plan.md's
  Project Structure. Every `Chunk` produced here has `embedding: null`.
- Commit after each checkpoint (end of each phase).

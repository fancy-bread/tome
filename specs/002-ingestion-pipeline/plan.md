# Implementation Plan: Ingestion Pipeline (Crawler + Chunker)

**Branch**: `002-ingestion-pipeline` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-ingestion-pipeline/spec.md`

## Summary

Build the `Crawler` and `Chunker` as standalone contracts (per Constitution
Principle IV) plus one concrete implementation each. `Crawler.crawl()`
turns a `Source` into `Document` metadata paired with the raw extracted
text (milestone 001's `Document` type has no text field — chunks are the
only durable text-bearing unit, so the crawler hands text to the chunker
directly rather than persisting it). `Chunker.chunk()` splits that text
into overlapping `Chunk`s with stable ordinals. Neither depends on
`DocumentIndex`, `Embedder`, or any storage — both are pure functions over
their inputs, matching FR-012 and this milestone's place in the roadmap
(the primitive milestone 003's storage layer can't defer).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (unchanged from
milestone 001; per constitution Technology Constraints)

**Primary Dependencies**: `cheerio` + `turndown` (HTML→Markdown), `pdf-parse`
(PDF text extraction), `simple-git` (git clone/working-tree access) — all
already named in the constitution's Technology Constraints, not new
choices. No new HTTP client: Node 24's built-in global `fetch` covers URL
fetching. No new directory-walking library: `fs.promises.readdir(path, {
recursive: true })` (stable since Node 20.1) covers path/git file
discovery without adding `glob`/`fast-glob`.

**Storage**: N/A — crawler/chunker are pure producers; persistence is
milestone 003

**Testing**: Vitest (unchanged). URL crawling is tested against a local
`http.createServer` fixture (no real network calls); git crawling is
tested against a real local git repository created as a temp-directory
fixture (real `git`, no network); PDF extraction is tested against one
small real PDF fixture file. See research.md for why each avoids mocking
the underlying library.

**Target Platform**: Node.js local daemon process (unchanged)

**Project Type**: Single project, extending the `src/` layout from
milestone 001

**Performance Goals**: N/A — no throughput target defined for this
milestone; correctness and bounded resource use (crawl bounds) are the
relevant constraints, not speed

**Constraints**: A URL crawl MUST NOT fetch outside the starting origin
and path prefix (FR-001) and MUST stop at its configured depth/page-count
bounds (FR-002); neither `Crawler` nor `Chunker` may import from
`src/storage/` or any future embedding module (FR-012, Principle IV)

**Scale/Scope**: One `Crawler` interface with three source-type strategies
(url/path/git) behind one implementation, one `Chunker` interface with one
implementation, tested against local fixtures for all three source types
plus chunking behavior

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Local-First, Privacy-by-Default | No silent/default network call beyond what the caller explicitly requested | **PASS** — fetching the URL or cloning the git repo the caller named is the literal feature, not a hidden side channel; no telemetry, no other network calls introduced |
| II. Graceful Degradation Over Hard Failure | Bounds/failures degrade rather than throw (FR-003, FR-007, FR-008) | **PASS** — bounded crawls return partial results; per-file/page failures are skipped and continue; only a source-level failure (unreachable start, unclonable repo) surfaces as `CrawlResult.error`, never an unhandled exception |
| III. Autonomous-Tool-Quality as a Design Requirement | MCP tool descriptions reviewed | **N/A this feature** — no MCP tool surface yet; applies starting at milestone 004 (MCP Server) and 006 (skill files) |
| IV. Interface-Segregated Storage & Embedding | `Crawler`/`Chunker` defined as interfaces; no storage/embedding coupling | **PASS** — both are pure contracts consumed by milestone 003 later; neither imports `DocumentIndex`, `Embedder`, or any concrete storage type |
| V. Minimal v1 Scope, Explicit Deferral | No out-of-scope capability introduced | **PASS** — no scheduled re-crawling, no push, nothing beyond spec.md's 13 FRs; User Story 5 (change detection) ships at P2 only because it falls out of FR-006's fingerprint with no extra mechanism |

No violations. Complexity Tracking is not needed for this feature.

**Post-Phase-1 re-check**: `contracts/crawler.ts` and `contracts/chunker.ts`
were reviewed against Principle IV — neither imports from `src/storage/`
or any embedding module; both depend only on milestone 001's `src/core/types.ts`.
`CrawlResult.error` and the per-file skip behavior (documented in
data-model.md's validation rules) keep Principle II's degrade-not-throw
contract intact through the design phase. Gate still **PASS**; no new
violations introduced by design.

## Project Structure

### Documentation (this feature)

```text
specs/002-ingestion-pipeline/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Extends milestone 001's `src/`/`tests/` layout with the `ingestion/`
sibling directory it already reserved, per its own Project Structure
section ("Later milestones add sibling directories under `src/` —
`ingestion/` (002)..."). Nothing in `src/core/` changes.

```text
src/
├── core/                    # unchanged from milestone 001
└── ingestion/
    ├── crawler.ts           # Crawler interface, CrawlResult/CrawledDocument/CrawlBounds types, DefaultCrawler
    ├── chunker.ts           # Chunker interface, DefaultChunker
    ├── walk-directory.ts    # shared file-walking helper (used by path AND git crawling)
    ├── hash.ts              # SHA-256 content fingerprint helper
    └── title.ts             # shared title-extraction heuristic (first Markdown heading)

tests/
├── contract/                # unchanged from milestone 001
└── ingestion/
    ├── url-crawler.test.ts  # spins up a local http.createServer fixture
    ├── path-crawler.test.ts # temp-directory fixtures (.md/.txt/.pdf + non-matching files)
    ├── git-crawler.test.ts  # real local git repo fixture, no network
    ├── chunker.test.ts      # chunking behavior, boundaries, stability
    └── fixtures/
        └── sample.pdf       # small real PDF for pdf-parse to run against
```

**Structure Decision**: Single project, no new top-level directories —
`src/ingestion/` and `tests/ingestion/` slot in beside `src/core/` and
`tests/contract/` exactly as milestone 001 anticipated. `walk-directory.ts`
is shared because FR-005 requires git crawling to walk its working tree
"the same file types as a local path source" — factoring it out is what
makes that requirement provably true rather than duplicated logic that
could drift.

## Complexity Tracking

*No violations — this section is not needed for this feature.*

# Implementation Plan: SQLite Document Index

**Branch**: `003-sqlite-document-index` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-sqlite-document-index/spec.md`

## Summary

Implement `SqliteDocumentIndex`, the concrete v1 `DocumentIndex`, backed by
`better-sqlite3` with an FTS5 virtual table for lexical search and a
`sqlite-vec` virtual table reserved (schema only) for milestone 005.
`addSource()` returns immediately after writing a `pending`/`indexing`
`Source` row, then runs crawling (milestone 002's `Crawler`) and chunking
(milestone 002's `Chunker`) as a detached background task that persists
`Document`/`Chunk` rows and settles the source to `ready`/`error`.
Refresh reuses existing document rows keyed by `(sourceId, uri)` and skips
re-chunking anything whose content hash hasn't changed. The implementation
must pass milestone 001's `runDocumentIndexContractTests` suite unmodified
(FR-016/SC-003) — the actual proof that the interface is
implementation-agnostic, not just compilable against a second class.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (unchanged)

**Primary Dependencies**: `better-sqlite3` (synchronous SQLite driver,
already named in the constitution's Technology Constraints) +
`@types/better-sqlite3`; `sqlite-vec` (loaded as a dynamic extension,
schema-only this milestone — no vector writes/reads until milestone 005;
ships its own `.d.ts`, no separate types package needed)

**Storage**: A single SQLite file. Production path:
`~/.claude/plugins/tome/index.db` / `CLAUDE_PLUGIN_DATA_DIR`, per the
constitution — not exercised directly in this milestone since there's no
plugin host yet (milestone 007). `SqliteDocumentIndex`'s constructor takes
a `dbPath` so tests can point at `:memory:` (fast, isolated per
connection) or a temp file (needed specifically to test that data
survives closing and reopening — SC-002 — since `:memory:` can't prove
that)

**Testing**: Vitest (unchanged). Milestone 001's `runDocumentIndexContractTests`
suite is imported and re-run against `SqliteDocumentIndex` unmodified
(FR-016). `SqliteDocumentIndex` must therefore also implement the
`TestableDocumentIndex` seed methods (`seedSource`/`seedDocument`/`seedChunk`)
the suite requires — as direct SQL inserts bypassing the crawl/chunk
pipeline, mirroring what `InMemoryDocumentIndex` did. New tests specific to
this milestone cover orchestration (crawl→chunk→persist), refresh/change-
detection, concurrent-refresh dedup, and cross-reopen persistence — none
of which the generic contract suite can exercise, since it knows nothing
about crawling or file-backed persistence.

**Target Platform**: Node.js local daemon process (unchanged)

**Project Type**: Single project, extending `src/` with a `storage/`
sibling per milestone 001's own Project Structure section

**Performance Goals**: N/A — no throughput target for this milestone;
correctness of persistence and refresh semantics is what's being proven

**Constraints**: `addSource()` MUST NOT block on crawling/chunking
(FR-002); a second concurrent `addSource()` call for a source already
being indexed MUST NOT start a second background job (FR-015); a
rejection inside the detached background task MUST be caught and turned
into `Source.status = 'error'`, never an unhandled promise rejection
(Constitution Principle II)

**Scale/Scope**: One concrete `DocumentIndex` implementation, 5 SQLite
tables/virtual-tables, one in-process in-flight-job tracker (`Map<sourceId,
Promise<void>>`) for concurrent-refresh dedup — no new public interfaces
beyond what milestone 001 already defined

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Local-First, Privacy-by-Default | No network call introduced; SQLite file stays on-device | **PASS** — `better-sqlite3` is a local file driver; no new network surface |
| II. Graceful Degradation Over Hard Failure | Crawl failures and concurrent-refresh races degrade rather than throw (FR-004, FR-015) | **PASS** — a rejected background job sets `status: 'error'` via a `.catch()`, never propagates as an unhandled rejection; the in-flight-job map absorbs concurrent `addSource` calls for the same source |
| III. Autonomous-Tool-Quality as a Design Requirement | MCP tool descriptions reviewed | **N/A this feature** — no MCP tool surface yet; applies starting at milestone 004 |
| IV. Interface-Segregated Storage & Embedding | `SqliteDocumentIndex` implements `DocumentIndex` without changing the interface; `Embedder` still injected, not hardcoded | **PASS** — FR-016/SC-003 is this principle's direct enforcement mechanism: the milestone 001 contract suite runs unmodified against this concrete class |
| V. Minimal v1 Scope, Explicit Deferral | No embedding, no MCP surface, no scheduled refresh introduced | **PASS** — `chunk_vectors` table exists but is never written to; embedding stays milestone 005's job |

No violations. Complexity Tracking is not needed for this feature.

**Post-Phase-1 re-check**: `contracts/sqlite-document-index.ts` and
`data-model.md` were reviewed against Principle IV — the constructor
takes `Embedder` as an injected dependency (not a hardcoded Ollama
client), and `DocumentIndex`'s method signatures are unchanged from
milestone 001. Against Principle II: the schema's `origin` column has no
`UNIQUE` constraint specifically so a duplicate-origin `addSource` call
degrades into the refresh path (FR-012) instead of surfacing a thrown
SQLite constraint-violation error. Gate still **PASS**; no new violations
introduced by design.

## Project Structure

### Documentation (this feature)

```text
specs/003-sqlite-document-index/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Extends `src/` with the `storage/` sibling milestone 001 already reserved
("Later milestones add sibling directories under `src/` — ... `storage/`
(003, adds `SqliteDocumentIndex` and re-runs `document-index.contract.ts`
against it per SC-003)").

```text
src/
├── core/
│   └── testable-document-index.ts   # DocumentIndexTestSeed/TestableDocumentIndex — relocated here from tests/
│                                     # during implementation; a src/ class implementing it can't depend on tests/
│                                     # without breaking tsconfig.build.json's rootDir (see research.md)
├── ingestion/               # unchanged (milestone 002)
└── storage/
    ├── sqlite-document-index.ts   # SqliteDocumentIndex — implements DocumentIndex + TestableDocumentIndex
    ├── schema.ts                   # CREATE TABLE / CREATE VIRTUAL TABLE statements, migration-free (v1: apply on open)
    ├── fts-query.ts                 # FTS5 MATCH query sanitization (token quoting)
    └── vector-codec.ts               # embedding <-> sqlite-vec buffer encoding (added during implementation)

tests/
├── contract/                # document-index.contract.ts now imports TestableDocumentIndex from src/core/ (re-exported for InMemoryDocumentIndex's existing import), test logic itself unchanged
└── storage/
    ├── sqlite-document-index.test.ts   # re-runs runDocumentIndexContractTests against SqliteDocumentIndex
    ├── orchestration.test.ts            # crawl→chunk→persist, status transitions, source-level failure handling
    ├── refresh.test.ts                   # change-detection (FR-013/014), concurrent-refresh dedup (FR-015)
    └── persistence.test.ts                # close + reopen against the same file, confirm data survives (SC-002)
```

**Structure Decision**: Single project, no new top-level directories.
`tests/contract/document-index.contract.ts` is imported by
`tests/storage/sqlite-document-index.test.ts`, not copied — a second copy
would defeat the entire point of FR-016 (the *same* suite, unmodified).

## Complexity Tracking

*No violations — this section is not needed for this feature.*

# Implementation Plan: Core Interfaces & Data Model

**Branch**: `001-core-interfaces-data-model` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-core-interfaces-data-model/spec.md`

## Summary

Lock the `DocumentIndex` and `Embedder` contracts, and the `Source`,
`Document`, `Chunk`, and `RankedChunk` types they operate on, as
TypeScript interface declarations with zero runtime implementation. A
contract-test suite exercises these interfaces against an in-memory test
double, proving (per SC-003) that a second backend could satisfy the same
contract without touching callers — the property every later milestone
(002 ingestion, 003 storage, 004 MCP server, 005 embedding) depends on.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (per constitution
Technology Constraints — Node 24 LTS chosen as the current LTS baseline;
see research.md)

**Primary Dependencies**: None beyond the TypeScript compiler — this
feature defines types and interfaces only, no runtime library is
introduced (Principle IV: contracts before implementations)

**Storage**: N/A — this feature defines the storage-facing contract; the
concrete SQLite-backed implementation is specified in milestone 003

**Testing**: Vitest, running a shared contract-test suite against an
in-memory `DocumentIndex`/`Embedder` test double (decision + rationale in
research.md)

**Target Platform**: Node.js local daemon process; cross-platform
(macOS/Linux/Windows, wherever Claude Code runs)

**Project Type**: Single project — TypeScript library, no frontend/backend
split

**Performance Goals**: N/A — no executable behavior beyond type
definitions and a test double; performance targets belong to the concrete
implementations in later milestones

**Constraints**: Interface signatures MUST NOT reference
implementation-specific types (e.g., no `better-sqlite3` statement types,
no Ollama client types) — this is the constraint Principle IV exists to
enforce, and this feature is where it's first tested

**Scale/Scope**: 2 interfaces (`DocumentIndex`, `Embedder`), 4 supporting
types (`Source`, `Document`, `Chunk`, `RankedChunk`), 1 contract-test suite
validated against 1 in-memory test double

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Local-First, Privacy-by-Default | Contracts must not presuppose a network call or off-device default | **PASS** — interfaces are transport- and storage-agnostic; nothing in the contract implies where data lives |
| II. Graceful Degradation Over Hard Failure | Contract shapes must make degrade-not-throw expressible (unavailable embedding, unknown fetch ID, failed source) | **PASS** — `Embedder` returns an absent vector rather than throwing (FR-012); `DocumentIndex.fetch` and source failures are modeled as data (`RankedChunk.rankedBy`, `Source.status`/`error`), not exceptions (FR-008, FR-010) |
| III. Autonomous-Tool-Quality as a Design Requirement | MCP tool descriptions reviewed for unprompted-invocation quality | **N/A this feature** — no MCP tool surface exists yet; applies starting at milestone 004 (MCP Server) and 006 (skill files) |
| IV. Interface-Segregated Storage & Embedding | `DocumentIndex`/`Embedder` defined as interfaces; no concrete implementation leaks through | **PASS** — this is the feature's entire purpose; contract-test suite (SC-003) is the enforcement mechanism going forward |
| V. Minimal v1 Scope, Explicit Deferral | No out-of-scope capability (scheduling, auth, push, multi-tenant) introduced | **PASS** — contracts cover exactly the four operations in the TDD; nothing else added |

No violations. Complexity Tracking is not needed for this feature.

**Post-Phase-1 re-check**: `contracts/types.ts`, `contracts/embedder.ts`,
and `contracts/document-index.ts` were reviewed against Principle IV —
none import or reference `better-sqlite3`, `sqlite-vec`, Ollama's client
shape, or any other implementation-specific type. `Embedder.embed`
returns `number[] | null` rather than throwing (Principle II), and
`DocumentIndex.fetch` rejects with a typed `NotFoundError` rather than an
unhandled exception. Gate still **PASS**; no new violations introduced by
design.

## Project Structure

### Documentation (this feature)

```text
specs/001-core-interfaces-data-model/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This is the first feature to introduce source code, so it establishes the
layout every later milestone (002–007) builds into. This repo ships one
thing — the plugin — not a monorepo of multiple packages, so the
TypeScript project lives at repo root rather than nested under a
`server/` subdirectory; `skills/` (markdown, added in milestone 006) sits
alongside it as a sibling. `plugin.json` (milestone 007) will point at
`./dist/index.js`, not `./server/dist/index.js`:

```text
src/
└── core/
    ├── types.ts           # Source, Document, Chunk, RankedChunk
    ├── document-index.ts  # DocumentIndex interface
    └── embedder.ts        # Embedder interface
tests/
└── contract/
    ├── document-index.contract.ts  # shared suite, run against any DocumentIndex
    ├── in-memory-document-index.ts # test double used by this feature
    └── document-index.test.ts      # wires the suite to the test double
package.json
tsconfig.json
vitest.config.ts
```

Later milestones add sibling directories under `src/` — `ingestion/`
(002), `storage/` (003, adds `SqliteDocumentIndex` and re-runs
`document-index.contract.ts` against it per SC-003), `mcp/` (004),
`embedding/` (005) — without modifying `core/`. `skills/` and
`plugin.json` land at repo root in 006–007.

**Structure Decision**: Single project at repo root, no frontend, no
`server/` nesting. This feature only populates `src/core/` and
`tests/contract/`, plus the minimal project scaffolding (`package.json`,
`tsconfig.json`, `vitest.config.ts`) needed to compile and test it — no
ingestion, storage, MCP, or embedding code.

## Complexity Tracking

*No violations — this section is not needed for this feature.*

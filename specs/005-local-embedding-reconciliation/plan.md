# Implementation Plan: Local Embedding & Reconciliation

**Branch**: `005-local-embedding-reconciliation` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-local-embedding-reconciliation/spec.md`

## Summary

`SqliteDocumentIndex` has always accepted an `Embedder` and calls it at
query time (`search()`), but nothing has ever called it at chunk-write
time — every chunk in production has been persisted with `embedding:
null`, and `chunk_vectors` (present in the schema since milestone 003)
has never actually been inserted into outside of test seeding. This
milestone closes that gap: a real `OllamaEmbedder` implementing the
existing `Embedder` interface, wired into `runIndexingJob` so chunks are
embedded as they're written, plus a background reconciliation pass
(interval-based, plus once on construction) that finds chunks still
missing an embedding and re-attempts them — so a chunk written while
Ollama was down catches up automatically once it recovers, per
Constitution Principle II.

## Technical Context

**Language/Version**: TypeScript, Node.js 24 LTS (unchanged)

**Primary Dependencies**: None new. `OllamaEmbedder` calls Ollama's local
HTTP API using the native `fetch` already used by `DefaultCrawler` for
URL sources (`src/ingestion/crawler.ts`) — no new npm dependency.

**Storage**: The existing SQLite file (`better-sqlite3` + `sqlite-vec`).
No schema change: `chunk_vectors` (a `vec0` virtual table keyed by
`rowid`) already supports a chunk having no matching row, which is
exactly what "null embedding" means today in `chunkFromRow`.

**Testing**: Vitest. `OllamaEmbedder` is tested against a real local
`node:http` server standing in for Ollama's API — the same
real-integration-over-mocks pattern already used for URL crawling
(`tests/ingestion/url-crawler.test.ts`) — not by mocking `fetch`.

**Target Platform**: The same long-running Node daemon process
introduced in milestone 004 (`src/index.ts`).

**Project Type**: Single project (unchanged).

**Performance Goals**: No new throughput target — embedding throughput
is bounded by the local Ollama installation, outside this feature's
control. The only timing requirement is qualitative (SC-002): a failed
`embed()` call must return promptly (`null`), not hang, so indexing
never stalls waiting on an unreachable embedding service.

**Constraints**: No chunk or query text may leave the device (SC-004,
Constitution Principle I) — the only network call this feature
introduces targets `localhost`.

**Scale/Scope**: One `OllamaEmbedder` instance and one reconciliation
loop per daemon process. No batching or queueing infrastructure —
sequential per-chunk `embed()` calls, consistent with Principle V's
minimal-v1-scope discipline; reconsidering this is explicitly deferred,
not a gap in this plan.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Local-First, Privacy-by-Default** — PASS. `OllamaEmbedder` talks
  only to a local Ollama instance (`http://localhost:11434` by default);
  no chunk or query text is sent anywhere else. No new account, API key,
  or non-local network call is introduced.
- **II. Graceful Degradation Over Hard Failure** — PASS; this principle
  is this milestone's entire subject. `Embedder.embed()`'s existing
  null-on-unavailable contract is honored by `OllamaEmbedder`
  (unreachable service, non-2xx response, and malformed/wrong-dimension
  response body are all treated identically — return `null`, never
  throw), and the reconciliation pass is the mechanism that fulfills the
  constitution's explicit "chunks written during an outage MUST be
  reconciled... without requiring a daemon restart or manual re-index"
  clause.
- **III. Autonomous-Tool-Quality as a Design Requirement** — N/A. No MCP
  tool or its description changes in this milestone.
- **IV. Interface-Segregated Storage & Embedding** — PASS.
  `OllamaEmbedder` implements the existing `Embedder` interface with no
  changes to it; `runIndexingJob` and the reconciliation pass call
  `this.embedder.embed(...)` exactly as `search()` already does — no
  code outside `src/embedding/ollama-embedder.ts` depends on Ollama's
  specific HTTP shape.
- **V. Minimal v1 Scope, Explicit Deferral** — PASS. No configuration
  surface is added for the Ollama URL, model name, or reconciliation
  interval beyond an internal constructor option used only by tests;
  production always uses the fixed local default. Batching, a
  configurable embedding backend, and a user-facing reconciliation status
  view are all out of scope and not implemented as side effects.

**Post-Design Re-Check**: Phase 1 (`data-model.md`, `contracts/`) introduces
no new persisted entities, no schema change, and no new public
`DocumentIndex` method — the only new public surface is
`reconciliationIntervalMs`, an internal test seam documented in both
`data-model.md` and `contracts/sqlite-document-index.ts` as explicitly
not user-facing. All five gates above still PASS with no changes to
their reasoning.

## Project Structure

### Documentation (this feature)

```text
specs/005-local-embedding-reconciliation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ollama-embedder.ts
│   └── sqlite-document-index.ts
└── tasks.md             # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
src/
├── embedding/
│   └── ollama-embedder.ts        # NEW — OllamaEmbedder implements Embedder
├── storage/
│   └── sqlite-document-index.ts  # MODIFIED — embed at chunk-write time,
│                                  # reconciliation loop, lifecycle in close()
└── index.ts                      # MODIFIED — construct OllamaEmbedder
                                   # instead of NoOpEmbedder

tests/
├── embedding/
│   └── ollama-embedder.test.ts   # NEW — real local http server standing
│                                  # in for Ollama
└── storage/
    └── reconciliation.test.ts    # NEW — chunk-write-time embedding +
                                   # background reconciliation behavior
```

**Structure Decision**: `src/embedding/` is a new top-level module,
mirroring `src/storage/`'s role: just as `src/storage/` holds the one
concrete implementation of `DocumentIndex`, `src/embedding/` holds the
one concrete implementation of `Embedder`, keeping the interface
(`src/core/embedder.ts`) and its implementation cleanly separated per
Principle IV. Everything else is a modification of milestone 003's and
004's existing files — no new top-level surface beyond that one module.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*

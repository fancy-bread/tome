# Implementation Plan: Remove a Source

**Branch**: `008-remove-source` | **Date**: 2026-08-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-remove-source/spec.md`

## Summary

Add `removeSource(id)` to the `DocumentIndex` interface: deletes a
source's row and cascades the deletion through its documents, chunks,
and embeddings, rejecting with the existing `NotFoundError` if `id`
doesn't match anything. Both `InMemoryDocumentIndex` and
`SqliteDocumentIndex` implement it; the SQLite implementation additionally
closes a real race (research.md) where a source removed while still
being indexed could otherwise have its in-flight background job write
orphaned rows back after the delete, which — traced through
`buildRankedChunk`'s existing non-null assertion — would surface as a
`search()` crash, not just stale content. Exposed as a fifth MCP tool
(`tome_remove_source`) and a fifth skill command (`/tome:remove`), both
following the exact wiring pattern milestones 004 and 006 already
established for the other four tools/three skills.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (unchanged)

**Primary Dependencies**: None new — reuses `better-sqlite3` (already a
dependency since milestone 003) for the cascade-delete statements

**Storage**: The same single SQLite file (`sources`/`documents`/`chunks`/
`chunk_vectors`/`chunk_text_fts`) milestone 003 already defined — no
schema change, only new DELETE statements against existing tables

**Testing**: Vitest (unchanged). New `removeSource` cases added to the
shared `document-index.contract.ts` suite (run against both
implementations, per milestone 003's FR-016/SC-003 precedent) plus a
`SqliteDocumentIndex`-specific test for the in-flight-job race (the
in-memory double has no background job to race against)

**Target Platform**: Node.js local daemon process (unchanged)

**Project Type**: Single project, extending existing `src/core/`,
`src/storage/`, `src/mcp/` files — no new top-level module

**Performance Goals**: N/A — no throughput target; correctness of the
cascade-delete and the in-flight-job race close is what's being proven

**Constraints**: Removal MUST take effect immediately even for a source
still `indexing` (FR-006) — ruling out any design that blocks
`removeSource` until an in-flight job finishes (research.md's rejected
alternative). Removing one source MUST NOT affect any other source's
data (FR-007)

**Scale/Scope**: One new interface method, one new MCP tool, one new
skill command, zero new tables, zero new types

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Local-First, Privacy-by-Default | No network call introduced | **PASS** — pure local SQLite deletes; nothing leaves the device |
| II. Graceful Degradation Over Hard Failure | Removing a nonexistent source degrades to a typed rejection, not a crash (FR-004); the in-flight-job race is closed rather than left to crash `search()` | **PASS** — reuses `NotFoundError` (no thrown-exception-crashes-the-daemon risk, `withErrorHandling` already covers it); research.md's Decision exists specifically to prevent a `search()` crash path this feature would otherwise introduce |
| III. Autonomous-Tool-Quality as a Design Requirement | MCP tool description reviewed | **PASS, deliberately inverted** — `tome_remove_source`'s description is written to *discourage* unprompted invocation (VISION.md: removal is a human call), the opposite bar from `tome_search`/`tome_fetch`, and that inversion is itself the correct application of this principle for a destructive tool |
| IV. Interface-Segregated Storage & Embedding | New method added to `DocumentIndex` interface, not bolted onto one implementation | **PASS** — `removeSource` is defined on the interface first; both `InMemoryDocumentIndex` and `SqliteDocumentIndex` implement it, and the shared contract suite runs against both, per Principle IV's own enforcement mechanism (milestone 003 precedent) |
| V. Minimal v1 Scope, Explicit Deferral | Stays within the v1.1 Fast Follow scope decision already made in `specs/000-tome-core/prd.md` before this plan | **PASS** — single-source removal only; no bulk removal, no soft-delete/trash/undo, no re-scoping — all explicitly named as out of scope in spec.md's Assumptions, matching the PRD's v1.1 tier exactly |

No violations. Complexity Tracking is not needed for this feature.

**Post-Phase-1 re-check**: `data-model.md` and `contracts/tools.ts`
reviewed against Principle IV — `removeSource` is defined on
`DocumentIndex` (`src/core/document-index.ts`), not added only to
`SqliteDocumentIndex`; `InMemoryDocumentIndex` gets a real (non-stub)
implementation so the shared contract suite can run unmodified against
both, exactly like every other interface method. Against Principle II:
research.md's settle-and-recheck design was chosen specifically because
the alternative (blocking `removeSource` on the in-flight job) would
have violated FR-006's "immediate effect" requirement, and doing nothing
would have left a traced `search()` crash path in place. Gate still
**PASS**; no new violations introduced by design.

## Project Structure

### Documentation (this feature)

```text
specs/008-remove-source/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── tools.ts          # Phase 1 output — TOME_REMOVE_SOURCE
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── core/
│   └── document-index.ts        # + removeSource(id): Promise<void> on the interface
├── storage/
│   └── sqlite-document-index.ts # + removeSource(): cascade-delete + in-flight-job recheck
└── mcp/
    ├── tool-descriptions.ts     # + TOME_REMOVE_SOURCE
    └── server.ts                 # + registerTool for tome_remove_source

skills/
└── remove/
    └── SKILL.md                  # new — /tome:remove, mirrors skills/add/SKILL.md's
                                   # human-gated (disable-model-invocation: true) shape

tests/
├── contract/
│   ├── document-index.contract.ts     # + removeSource cases (both implementations)
│   └── in-memory-document-index.ts    # + removeSource implementation
├── storage/
│   └── remove-source.test.ts          # new — cascade-delete + in-flight-job race
├── mcp/
│   └── server.test.ts                 # + tome_remove_source tool test + description-content test
├── skills/
│   └── skill-files.test.ts            # + a new describe block for skills/remove/SKILL.md's own content
└── plugin/
    └── plugin-config.test.ts          # + 'remove' added to the expected skill directory list
```

**Structure Decision**: Extends milestones 001/003/004/006's existing
`src/core/`, `src/storage/`, `src/mcp/`, `skills/` layout directly — this
feature adds one interface method, its two implementations, one MCP
tool, and one skill file, with no new top-level directory or module
boundary.

## Complexity Tracking

*No violations — table not needed.*

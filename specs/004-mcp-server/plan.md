# Implementation Plan: MCP Server

**Branch**: `004-mcp-server` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-mcp-server/spec.md`

## Summary

Build `src/mcp/server.ts` — a function that takes a `DocumentIndex` (the
interface, not `SqliteDocumentIndex` concretely, per Principle IV) and
returns a configured MCP server exposing four tools, each a thin
translation layer over the index's existing methods. Every handler is
wrapped so a thrown error becomes a structured `isError: true` tool
result, never an uncaught exception over stdio (FR-007/008/009).
`tome_search`/`tome_fetch`'s descriptions are written as direct directives
telling the calling agent to use them proactively (FR-010), reviewed with
the same rigor as their schemas per Constitution Principle III. A new
`src/index.ts` is this milestone's daemon entry point — the first time
anything in this project is actually runnable as a standalone process —
constructing a real `SqliteDocumentIndex` and connecting a
`StdioServerTransport`, ahead of milestone 007 wiring it into a
Claude Code plugin.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (unchanged)

**Primary Dependencies**: `@modelcontextprotocol/sdk` (constitution-named;
targeting the current `1.30.0`). Exact tool-registration API (the
higher-level `McpServer.registerTool`-style surface vs. the lower-level
`Server` + raw request handlers) needs confirming against the installed
version before writing `server.ts` — see research.md's open verification
item, same category as milestone 002's `pdf-parse` and milestone 003's
`sqlite-vec` discoveries.

**Storage**: Unchanged — `SqliteDocumentIndex` from milestone 003, via a
real file path in production (`CLAUDE_PLUGIN_DATA_DIR`, falling back to a
sensible default for standalone/dev runs before milestone 007's plugin
harness exists) or `:memory:`/a temp file in tests.

**Testing**: Vitest (unchanged). Two tiers: fast MCP-layer tests
constructing `createTomeServer(new InMemoryDocumentIndex())` — no SQLite,
no crawling, just proving the protocol translation, error mapping, and
tool-description text itself (FR-010/SC-005 are checkable by reading a
string, not just by running code); one slower end-to-end test
constructing `createTomeServer(new SqliteDocumentIndex(...))` and driving
the full add→search→fetch→list sequence over a real client connection,
proving SC-002. Whether the SDK ships an in-memory linked-transport
helper for tests (avoiding a real child-process spawn) is also an open
verification item.

**Target Platform**: Node.js local daemon process (unchanged) — this
milestone is the first time that daemon is actually startable

**Project Type**: Single project, extending `src/` with an `mcp/` sibling
per milestone 001's own forward-declared Project Structure

**Performance Goals**: N/A — no throughput target; correctness of the
protocol translation and error-isolation guarantee (FR-008) is what
matters here

**Constraints**: A thrown error inside any one tool handler MUST NOT
prevent the server from handling a subsequent, unrelated call (FR-008) —
this is the direct constraint driving the per-handler try/catch design,
not a suggestion

**Scale/Scope**: One server-construction function, four tool handlers,
one daemon entry point — no new persisted entities (per spec.md's Key
Entities section)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Local-First, Privacy-by-Default | No network call introduced; stdio is local IPC | **PASS** — the MCP transport is stdio, not a network socket; the index it wraps still defaults to local SQLite + a stub embedder |
| II. Graceful Degradation Over Hard Failure | Protocol-boundary failures degrade rather than crash (FR-007, FR-008, FR-009) | **PASS** — this is the milestone's central concern at a new boundary: every tool handler is wrapped so a thrown error becomes a structured tool result, never an uncaught exception that would take down the whole server |
| III. Autonomous-Tool-Quality as a Design Requirement | `tome_search`/`tome_fetch` descriptions drive unprompted invocation | **PASS — this is the milestone's other central concern.** FR-010/SC-005 make description text itself a checked requirement, not an afterthought |
| IV. Interface-Segregated Storage & Embedding | MCP layer depends on `DocumentIndex` the interface, not `SqliteDocumentIndex` concretely | **PASS** — `createTomeServer(index: DocumentIndex)` accepts any implementation; this is what makes the fast `InMemoryDocumentIndex`-backed test tier possible at all |
| V. Minimal v1 Scope, Explicit Deferral | No skill files, no plugin packaging, no real embeddings introduced | **PASS** — spec.md's Assumptions section explicitly defers all three to milestones 005–007 |

No violations. Complexity Tracking is not needed for this feature.

**Post-Phase-1 re-check**: `contracts/tools.ts` and `data-model.md` were
reviewed against Principle III — `tome_search`/`tome_fetch`'s
descriptions both name the triggering situation and explicitly instruct
proactive use, matching FR-010. Against Principle II: the Error Handling
table in data-model.md is exhaustive by construction (every tool handler
funnels through the same try/catch shape), not by enumerating failure
cases one at a time. Against Principle IV: neither `contracts/tools.ts`
nor `data-model.md` references `SqliteDocumentIndex`, `better-sqlite3`,
or any concrete storage detail — only `DocumentIndex`'s existing types.
Gate still **PASS**; no new violations introduced by design.

## Project Structure

### Documentation (this feature)

```text
specs/004-mcp-server/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Extends `src/` with the `mcp/` sibling milestone 001 already reserved
("Later milestones add sibling directories under `src/` — ... `mcp/`
(004)"). Adds the repository's first real process entry point.

```text
src/
├── core/                    # unchanged
├── ingestion/               # unchanged (milestone 002)
├── storage/                 # unchanged (milestone 003)
├── mcp/
│   ├── server.ts            # createTomeServer(index: DocumentIndex) — builds the MCP server, wires the 4 tools
│   └── tool-descriptions.ts # tome_search/tome_fetch/tome_add_source/tome_list_sources description text, isolated for easy review (Principle III)
└── index.ts                  # daemon entry point: real SqliteDocumentIndex + stub Embedder + StdioServerTransport

tests/
├── contract/                # unchanged
├── ingestion/                # unchanged
├── storage/                   # unchanged
└── mcp/
    ├── server.test.ts          # fast tier — createTomeServer(new InMemoryDocumentIndex()), no SQLite/crawling
    └── end-to-end.test.ts       # slow tier — createTomeServer(new SqliteDocumentIndex(...)), full add→search→fetch→list over a real client (SC-002)
```

**Structure Decision**: Single project, no new top-level directories.
`server.ts` takes `DocumentIndex` as a parameter — never imports
`SqliteDocumentIndex` directly — so the fast test tier can substitute
`InMemoryDocumentIndex` (milestone 001) with zero SQLite/crawling
overhead, the same interface-segregation payoff Principle IV exists for.

## Complexity Tracking

*No violations — this section is not needed for this feature.*

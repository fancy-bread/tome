# Quickstart: MCP Server

Validates that the server actually exposes `DocumentIndex` over MCP —
proving this milestone's headline claim, the "first real end-to-end
vertical slice."

## Prerequisites

- Node.js 24 LTS, dependencies installed: `npm install` (adds
  `@modelcontextprotocol/sdk` as a runtime dependency)

## What gets validated

```
tests/mcp/
├── server.test.ts       # fast tier — InMemoryDocumentIndex, no SQLite/crawling
└── end-to-end.test.ts    # slow tier — real SqliteDocumentIndex, full protocol round trip
```

## Run it

```bash
npm test
```

## Expected outcome

- **SC-001** — `server.test.ts`: a connecting client's tool-list request
  returns all four tools with names, descriptions, and input schemas.
- **SC-005** — `server.test.ts`: `tome_search`/`tome_fetch`'s advertised
  `description` strings are asserted to contain proactive-use language
  (e.g. "Call this proactively"), checkable by reading the string itself.
- **SC-003/SC-004** — `server.test.ts`: `tome_fetch` with an unknown id
  returns `isError: true`; a subsequent, unrelated call in the same
  session still succeeds — proving one failure doesn't take the server
  down.
- **SC-002** (the headline result) — `end-to-end.test.ts`: against a real
  `SqliteDocumentIndex`, the full sequence — `tome_add_source` → wait for
  indexing → `tome_search` → `tome_fetch` a result's id →
  `tome_list_sources` — completes entirely through MCP tool calls with
  accurate results at each step.

## Manual smoke test (optional)

To see the actual daemon run as a standalone process:

```bash
npm run build
node dist/index.js
```

The process starts and waits on stdio for MCP protocol messages — it
won't print anything on success (stdout is reserved for the protocol);
Ctrl-C to stop it. Not a substitute for the test suite above, just a
sanity check that `src/index.ts` actually boots.

## Type-checking

```bash
npx tsc --noEmit
```

# Quickstart: Local Embedding & Reconciliation

Validates that chunks are actually embedded at write time, that indexing
degrades gracefully when the embedding service is down, and that content
catches up automatically once it recovers.

## Prerequisites

- Node.js 24 LTS, dependencies installed: `npm install` (no new runtime
  dependency this milestone — see research.md #1)
- No real Ollama installation is required to run the test suite: the
  automated tests stand in a local `node:http` server for Ollama's API
  (see `tests/embedding/ollama-embedder.test.ts`), matching the project's
  existing pattern for URL-crawling tests.

## What gets validated

```
tests/embedding/
└── ollama-embedder.test.ts   # OllamaEmbedder against a real local http server:
                                # success, unreachable service, non-2xx,
                                # malformed body, wrong-dimension embedding

tests/storage/
└── reconciliation.test.ts    # chunk-write-time embedding via SqliteDocumentIndex,
                                # startup + recurring reconciliation passes,
                                # no interference with concurrent addSource/search
```

## Run it

```bash
npm test
```

## Expected outcome

- **SC-001** — `reconciliation.test.ts`: a chunk embedded at write time
  with a fake embedder that returns semantically meaningful vectors is
  returned by `search()` with `rankedBy: "vector"` for a query sharing no
  keywords with it.
- **SC-002** — `reconciliation.test.ts`: constructing the index with an
  embedder that always returns `null` (simulating Ollama being down)
  still reaches `ready` status and its content is immediately searchable
  by keyword.
- **SC-003** — `reconciliation.test.ts`: a chunk written with a `null`
  embedding acquires a real one after the reconciliation interval elapses
  and the embedder starts succeeding, with no explicit user action beyond
  the test's short poll (mirroring `tests/mcp/end-to-end.test.ts`'s
  `waitUntilReady` pattern).
- **SC-004** — `ollama-embedder.test.ts`: every request `OllamaEmbedder`
  makes targets the test's own `localhost` server; no assertion or test
  setup involves any non-local address.
- **SC-005** — `reconciliation.test.ts`: `addSource` and `search` calls
  issued while a reconciliation pass is in flight complete correctly and
  are not delayed waiting on it.

## Manual smoke test (optional)

To see real semantic ranking against an actual local Ollama instance:

```bash
ollama serve &
ollama pull nomic-embed-text
npm run build
CLAUDE_PLUGIN_DATA_DIR=/tmp/tome-smoke node dist/index.js
```

Then, from a separate MCP client (or `tests/mcp/test-client.ts`-style
harness), call `tome_add_source` with a local path, wait for it to reach
`ready` via `tome_list_sources`, and call `tome_search` with a query
that's semantically related to the content but shares no exact keywords
with it — the result should come back with `rankedBy: "vector"`. Not a
substitute for the automated suite above; a sanity check that the real
Ollama integration (not just the test double) actually works end-to-end.

## Type-checking

```bash
npx tsc --noEmit
```

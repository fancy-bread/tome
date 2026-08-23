# Quickstart: Remove a Source

Validates that removing a source actually deletes its content — not
just that it disappears from `tome_list_sources`, but that it stops
contributing to `tome_search`/`tome_fetch`, that removing one source
never touches another, and that a source removed mid-index doesn't come
back once its background job finishes.

## Prerequisites

- Node.js 24 LTS, dependencies already installed (`npm install`) — no
  new runtime dependency this feature.

## What gets validated

```
tests/
├── contract/document-index.contract.ts   # extended: removeSource cases,
│                                          # run against BOTH InMemoryDocumentIndex
│                                          # and SqliteDocumentIndex (FR-016 pattern)
├── storage/remove-source.test.ts         # new — cascade-delete + in-flight-job race
├── mcp/server.test.ts                    # extended: tome_remove_source tool + description-content test
└── mcp/end-to-end.test.ts                # extended: tome_remove_source through real MCP calls,
                                           # including a tome_fetch-after-remove check
```

## Run it

```bash
npm test
```

## Expected outcome

- **SC-001/SC-002** (contract suite, both implementations) — after
  `removeSource(id)`, that id is absent from `listSources()`, and a
  `search()` query that previously matched its content returns no
  results from it.
- **SC-003** — `removeSource()` with an unknown id rejects with
  `NotFoundError`, distinguishable from the success case (which
  resolves).
- **SC-004** (`remove-source.test.ts`) — with two sources indexed,
  removing one leaves the other's `listSources()`/`search()`/`fetch()`
  results byte-for-byte unchanged.
- **User Story 3** (`remove-source.test.ts`, `SqliteDocumentIndex` only
  — this race doesn't exist for the in-memory double): add a source,
  call `removeSource(id)` before its background indexing job settles,
  then wait for what that job would have done. Assert `listSources()`
  never shows `id` again and `search()` never surfaces any of its
  content — proving research.md's settle-and-recheck decision actually
  closes the race, not just that it compiles.
- **SC-001/SC-002 at the MCP protocol layer, not just the interface**
  (`mcp/end-to-end.test.ts`) — the contract suite above proves this
  against `DocumentIndex` directly; a separate test proves the same
  thing through real `tome_search`/`tome_fetch`/`tome_remove_source`
  tool calls, including confirming `tome_fetch` returns `isError: true`
  for a chunk id that resolved fine before removal (not just that
  `tome_search` stops finding it).
- **Manual/exploratory check** — through the real MCP tools (mirrors
  what battle-testing already exercises manually against the live
  plugin): `tome_add_source` a source, `tome_search` for something in
  it, `tome_fetch` one of the results, `tome_remove_source` it, then
  repeat both the same `tome_search` query (confirm nothing from that
  source appears) and the same `tome_fetch` call (confirm it now
  reports the id doesn't exist).

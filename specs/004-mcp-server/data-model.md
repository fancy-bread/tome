# Phase 1 Data Model: MCP Server

No new persisted entities (per spec.md's Key Entities section). What
follows are the transient MCP tool request/response shapes — protocol
framing around `Source`/`Document`/`Chunk`/`RankedChunk` (all from
milestone 001), not new data. See research.md for why these differ from
`tdd.md`'s original sketch in two places.

## `tome_add_source`

**Request**: `{ type: 'url' | 'path' | 'git', origin: string }`

**Response**: `{ sourceId: string, status: Source['status'] }` — built
directly from the `Source` returned by `DocumentIndex.addSource()`.

## `tome_search`

**Request**: `{ query: string, limit?: number, sourceId?: string }`

**Response**: `{ results: SearchResult[] }` where each `SearchResult` is:

| Field | Type | From |
|---|---|---|
| `chunkId` | `string` | `RankedChunk.chunk.id` |
| `text` | `string` | `RankedChunk.chunk.text` |
| `sourceId` | `string` | `RankedChunk.source.id` |
| `uri` | `string` | `RankedChunk.document.uri` |
| `title` | `string \| null` | `RankedChunk.document.title` |
| `score` | `number` | `RankedChunk.score` |
| `rankedBy` | `'vector' \| 'lexical'` | `RankedChunk.rankedBy` |

## `tome_fetch`

**Request**: `{ id: string }`

**Response**: A discriminated union on `type`, reflecting exactly what
`DocumentIndex.fetch()` can return — see research.md for why this
replaces `tdd.md`'s original `"text" | "documentText"` sketch:

- Chunk: `{ id, type: 'chunk', text, documentId, ordinal }`
- Document: `{ id, type: 'document', uri, title, sourceId }`

**Error**: `fetch()` rejecting with `NotFoundError` becomes an
`isError: true` tool result (FR-007), not a response shape — see the
Error Handling section below.

## `tome_list_sources`

**Request**: `{}` (no parameters)

**Response**: `{ sources: SourceSummary[] }` where each `SourceSummary` is
exactly `Source`'s fields — `{ id, type, origin, status, lastIndexedAt,
error }` — no `documentCount`/`chunkCount` (see research.md).

## Error Handling (all four tools)

| Condition | MCP tool result |
|---|---|
| `NotFoundError` from `fetch()` | `{ isError: true, content: [{ type: 'text', text: err.message }] }` |
| Missing/invalid required argument | Same shape, `err.message` describing what's missing/invalid |
| Any other unexpected thrown error | Same shape, `err.message` (or `String(err)` for a non-`Error` throw) |

No tool handler ever lets an exception propagate past its own try/catch
(FR-008) — this table is exhaustive by construction, not by enumeration
of every possible failure.

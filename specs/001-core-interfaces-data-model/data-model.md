# Phase 1 Data Model: Core Interfaces & Data Model

Entities extracted from spec.md's Key Entities section. Field names and
types are chosen to match the shapes already agreed in
`specs/000-tome-core/tdd.md`, since this feature is what promotes those
shapes from design-doc prose to an enforced contract. Interface
declarations (`DocumentIndex`, `Embedder`) live in `contracts/`, not here
— this file covers the data they operate on.

## Source

Something the index has been pointed at.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unique identifier, assigned on creation (FR-001) |
| `type` | `'url' \| 'path' \| 'git'` | Fixed at creation; not mutable on refresh |
| `origin` | `string` | The URL, absolute path, or repo URL; unique per source (FR-003) |
| `addedAt` | `number` | Unix ms, set once at creation |
| `lastIndexedAt` | `number \| null` | Unix ms; `null` until the first successful index completes (FR-002) |
| `status` | `'pending' \| 'indexing' \| 'ready' \| 'error'` | See state transitions below |
| `error` | `string \| null` | Human-readable explanation; populated only when `status === 'error'` (FR-010) |

**Validation rules**:
- `origin` MUST be unique across all sources (FR-003) — a second `addSource` call with an existing `origin` refreshes rather than creates.
- `error` MUST be `null` whenever `status !== 'error'`.

**State transitions**:

```
(none) → pending        on addSource for a new origin
pending → indexing       when crawling begins
indexing → ready         crawl + embed completed (fully or partially — FR-010, Edge Cases)
indexing → error         crawl/embed failed; error explanation set
ready → indexing         addSource called again on existing origin (refresh, FR-003)
error → indexing         addSource called again on existing origin (retry via refresh)
```

A source already in `indexing` that receives another `addSource` call for
its own `origin` stays in `indexing` — the second call attaches to the
in-flight refresh rather than starting a concurrent one (Edge Cases).

## Document

A single piece of content fetched from within a source.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unique identifier |
| `sourceId` | `string` | References `Source.id` |
| `uri` | `string` | Canonical location within the source (path or URL) |
| `title` | `string \| null` | Extracted title, if any |
| `contentHash` | `string` | Fingerprint of raw fetched content; drives change detection on refresh |
| `fetchedAt` | `number` | Unix ms |

**Validation rules**:
- `contentHash` MUST change if and only if the underlying content changed since the last fetch — this is what lets a refresh skip unchanged documents (deferred to milestone 002/003's implementation, but the field's contract is fixed here).

## Chunk

A segment of a document's text.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unique identifier |
| `documentId` | `string` | References `Document.id` |
| `ordinal` | `number` | Position within the document; stable ordering |
| `text` | `string` | Chunk content |
| `embedding` | `number[] \| null` | Vector representation; `null` means not yet embedded, not an error (FR-012, Constitution Principle II) |
| `tokenCount` | `number` | Size of `text`, in tokens |

**Validation rules**:
- `embedding: null` MUST be a valid, expected state (not an error condition) — a chunk with a null embedding is still searchable via lexical ranking (FR-005, Edge Cases).

## RankedChunk

A chunk returned from a search, with the context needed to act on it.

| Field | Type | Notes |
|---|---|---|
| `chunk` | `Chunk` | The matched chunk |
| `document` | `Document` | Its parent document |
| `source` | `Source` | Its parent source |
| `score` | `number` | Relevance score; scale is ranking-method-dependent, not cross-comparable between methods |
| `rankedBy` | `'vector' \| 'lexical'` | Which ranking method actually produced this result (FR-004) |

**Validation rules**:
- `rankedBy` MUST reflect the method that actually scored this specific result, not the method preferred globally — a single search response can mix `'vector'` and `'lexical'` entries when the corpus is in a partial-embedding state (Edge Cases).

## Relationships

```
Source 1 ──< Document 1 ──< Chunk
                                  \
                                   > RankedChunk (denormalized: chunk + document + source + score + rankedBy)
```

`RankedChunk` is a read-time composition, not a stored entity — it's
assembled by `DocumentIndex.search()` from a `Chunk` plus its ancestor
`Document` and `Source` at query time.

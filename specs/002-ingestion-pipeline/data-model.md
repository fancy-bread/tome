# Phase 1 Data Model: Ingestion Pipeline (Crawler + Chunker)

This milestone introduces no new persisted entities — `Source`,
`Document`, and `Chunk` are already locked in milestone 001
(`src/core/types.ts`) and unchanged here. What's new are the
transient, in-memory shapes the `Crawler`/`Chunker` contracts use to move
data between each other and their eventual caller (milestone 003's
storage layer). None of these are stored; they exist only for the
duration of a single `crawl()`/`chunk()` call.

## CrawlBounds

Governs how far a URL crawl extends (FR-002).

| Field | Type | Notes |
|---|---|---|
| `maxDepth` | `number` | Default `3`. Depth 0 is the starting page; each hop adds 1. |
| `maxPageCount` | `number` | Default `200`. Total documents fetched across the whole crawl. |

**Validation rules**:
- Both fields MUST be positive integers when provided; a caller who omits
  either gets the default for that field specifically (partial override).
- Only meaningful for `type: 'url'` — ignored for `path`/`git` sources,
  which have no analogous notion of depth or page count.

## CrawlInput

What a caller passes to `Crawler.crawl()`.

| Field | Type | Notes |
|---|---|---|
| `type` | `SourceType` (`'url' \| 'path' \| 'git'`) | From milestone 001 |
| `origin` | `string` | URL, absolute path, or repo URL/existing clone path |
| `sourceId` | `string` | The already-created `Source.id` this crawl is for (discovered during implementation: `Document.sourceId` is required per milestone 001, but nothing else in `CrawlInput` identifies it — the caller creates the `Source` first and passes its id here) |
| `bounds` | `Partial<CrawlBounds>` (optional) | Only consulted when `type === 'url'` |

## CrawledDocument

Pairs a `Document`'s metadata with the raw text extracted for it —
the answer to "where does fetched text live if `Document` has no text
field?" (see research.md).

| Field | Type | Notes |
|---|---|---|
| `document` | `Document` | Metadata only, per milestone 001's type — `contentHash` already computed (FR-006) |
| `text` | `string` | Raw extracted text (Markdown-converted for URL/HTML sources, read directly for `.md`/`.txt`, extracted via `pdf-parse` for `.pdf`). Consumed by `Chunker.chunk()`; never persisted itself. |

## CrawlResult

What `Crawler.crawl()` resolves to.

| Field | Type | Notes |
|---|---|---|
| `documents` | `CrawledDocument[]` | Everything successfully fetched/parsed, including partial results from a bounded or partially-failed crawl (FR-003, FR-007) |
| `error` | `string \| null` | Set only for a source-level failure (unreachable start URL, unclonable repo — FR-008); `null` on full or partial success. Per-file/page failures within an otherwise-successful crawl are reflected by their absence from `documents`, not by this field. |

**Validation rules**:
- `error !== null` MUST imply `documents` is empty — a source-level
  failure means the crawl produced nothing usable, by definition (FR-008:
  "producing zero Documents for that attempt").
- `error === null` with an empty `documents` array is valid and distinct
  from a source-level failure — it means the source was reachable but
  contained nothing matching (empty directory, page-count bound hit before
  any successful fetch is *not* this case, since the starting page itself
  counts as fetched before bounds apply).

## Relationship to milestone 001's types

```
CrawlInput ──> Crawler.crawl() ──> CrawlResult
                                     └─ CrawledDocument[] (document: Document, text: string)
                                              │
                                              ▼
                                  Chunker.chunk(documentId, text) ──> Chunk[]
```

`Document.contentHash`, `Document.title`, and `Document.fetchedAt` are all
populated by the crawler before a `CrawledDocument` is returned — nothing
downstream (the chunker, or eventually milestone 003's storage layer)
computes them. `Chunk.embedding` stays `null` on everything the chunker
produces; assigning it is milestone 005's job.

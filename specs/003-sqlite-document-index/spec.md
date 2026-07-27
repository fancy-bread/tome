# Feature Specification: SQLite Document Index

**Feature Branch**: `003-sqlite-document-index`
**Created**: 2026-07-27
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Add a Source and See It Indexed (Priority: P1)

A caller adds a source. The index returns immediately with a pending
identifier, then crawls and chunks that source in the background,
updating the source's status as the work progresses, until it settles on
ready (with a last-indexed time) or error (with an explanation).

**Why this priority**: This is the entire point of persistence — a
source added once must still be there, and its indexing outcome
observable, after the initial call returns and even after the process
restarts.

**Independent Test**: Add a source, confirm it's visible immediately
with pending/indexing status, then confirm it later settles to ready
(with content actually queryable) or error (with a clear message),
without the original call ever having blocked on that work.

**Acceptance Scenarios**:

1. **Given** a new source, **When** it's added, **Then** the call returns
   immediately with a pending or indexing status, before crawling has
   necessarily finished.
2. **Given** a source that finished indexing successfully, **When** its
   status is checked, **Then** it shows ready with a last-indexed time,
   and its content is queryable.
3. **Given** a source whose crawl failed at the source level, **When**
   its status is checked, **Then** it shows error with a human-readable
   explanation, rather than the process having crashed.

---

### User Story 2 — Search Indexed Content (Priority: P1)

A caller searches. The index returns ranked chunks from persisted
content, ranked lexically (no semantic ranking exists yet in this
milestone), optionally scoped to one source.

**Why this priority**: Search against real, persisted content — not an
in-memory fake — is what proves this milestone's storage actually works,
not just that it compiles against the interface.

**Independent Test**: Add a source, wait for it to finish indexing,
search for text known to be in it, and confirm matching chunks come back
labeled as lexically ranked, with source metadata attached.

**Acceptance Scenarios**:

1. **Given** successfully indexed content relevant to a query, **When** a
   caller searches, **Then** matching chunks are returned, each labeled
   as lexically ranked.
2. **Given** a search scoped to one source's id, **When** it runs,
   **Then** only that source's chunks are eligible to appear in results.
3. **Given** a query matching nothing, or no sources indexed at all,
   **When** a caller searches, **Then** an empty result set is returned,
   not an error.

---

### User Story 3 — Retrieve a Chunk or Document by Identifier (Priority: P1)

A caller fetches a chunk or document by the identifier a search result
gave them, and gets back the real, persisted content.

**Why this priority**: Search results are excerpts; retrieving the full
persisted record behind one is a core, frequently-needed operation.

**Independent Test**: Fetch a known chunk id and a known document id
after indexing, and confirm both return their real persisted content;
fetch an id that was never indexed and confirm a clear error, not a
crash.

**Acceptance Scenarios**:

1. **Given** a chunk id from a completed index, **When** a caller fetches
   it, **Then** the persisted chunk's text and metadata are returned.
2. **Given** a document id from a completed index, **When** a caller
   fetches it, **Then** the persisted document's metadata is returned.
3. **Given** an id that was never indexed, **When** a caller fetches it,
   **Then** a structured error is returned, not a crash.

---

### User Story 4 — List Sources and Their Status (Priority: P2)

A caller lists every source that's ever been added, with its real,
persisted, current status.

**Why this priority**: Checking on indexing progress and history is how a
caller knows whether it's safe to search yet, or whether a source needs
attention — but it's secondary to the read/write paths themselves working.

**Independent Test**: Add two sources, list them immediately (both
pending/indexing), then list again after they settle and confirm accurate
status, last-indexed time, and any error message, matching what actually
happened during indexing.

**Acceptance Scenarios**:

1. **Given** sources added at different times, **When** a caller lists
   them, **Then** every one appears with its real, current status and
   last-indexed time.
2. **Given** a source that failed to index, **When** a caller lists
   sources, **Then** it shows error with the actual failure explanation.

---

### User Story 5 — Refresh Skips Unchanged Documents (Priority: P2)

A caller re-adds a source that's already been indexed. Documents whose
content hasn't changed since the last successful index are left alone —
not re-chunked, not rewritten — while documents that did change get
re-chunked and replace what was there before.

**Why this priority**: Named a should-have, not a hard requirement, in
the product plan — refresh working at all (User Story 1's dedup behavior)
matters more than refresh being efficient about it. This is the
efficiency layer on top of a refresh that already functions.

**Independent Test**: Index a source, refresh it with no changes, and
confirm the previously-stored chunks are untouched (same ids, same
content); change one document in the source, refresh again, and confirm
only that document's chunks were replaced.

**Acceptance Scenarios**:

1. **Given** a source refreshed with no underlying changes, **When** the
   refresh completes, **Then** every previously-stored chunk is
   byte-for-byte unchanged — nothing was re-chunked or rewritten.
2. **Given** a source where exactly one document changed since the last
   index, **When** it's refreshed, **Then** only that document's chunks
   are replaced; all others remain as they were.

---

### Edge Cases

- What happens when a second `addSource` call arrives for an origin
  that's still being indexed from a first call? It attaches to the
  in-flight indexing rather than starting a second, concurrent one
  (carried over from milestone 001's contract, now enforced against real
  persistence).
- What happens when a search is scoped to a source id that doesn't exist,
  or that exists but has no indexed content yet? An empty result set,
  not an error.
- What happens when the crawl underlying an `addSource` call reports a
  source-level failure partway through what would otherwise be a
  refresh? The source's status becomes error with that explanation; any
  content from a *previous* successful index is left in place and still
  searchable, not discarded.
- What happens when `fetch` is called with the id of a chunk that a
  refresh has since replaced? A structured error — the old id no longer
  resolves to anything, since it was replaced, not retained.

## Requirements

### Functional Requirements

- **FR-001**: The index MUST persist `Source`, `Document`, and `Chunk`
  records so they survive process restarts.
- **FR-002**: Adding a source MUST return immediately with a pending or
  indexing status; crawling and chunking MUST happen without blocking
  that call (per milestone 001's contract).
- **FR-003**: Adding a source MUST result in that source's content being
  crawled and split into chunks, with the results persisted.
- **FR-004**: When crawling a source fails at the source level, the
  source's status MUST become error with a human-readable explanation,
  rather than the failure crashing the process or the call.
- **FR-005**: When indexing a source completes successfully, its status
  MUST become ready and its last-indexed time MUST be recorded.
- **FR-006**: Every chunk persisted by this milestone MUST be searchable
  via lexical ranking; none require a semantic embedding to be findable
  (no embedding capability exists yet).
- **FR-007**: Searching MUST return matching chunks labeled as lexically
  ranked, ordered by relevance.
- **FR-008**: Searching MUST support restricting results to a single
  source when requested.
- **FR-009**: Searching MUST return an empty result set, never an error,
  when nothing matches or nothing has been indexed.
- **FR-010**: Fetching MUST return the persisted chunk or document for a
  known id, or a structured error for an unknown or no-longer-valid id.
- **FR-011**: Listing sources MUST return every added source with its
  real, current type, origin, status, last-indexed time, and error
  message where applicable.
- **FR-012**: Re-adding an already-indexed source's origin MUST refresh
  that same source rather than creating a duplicate.
- **FR-013**: During a refresh, a document whose content has not changed
  since the last successful index MUST NOT be re-chunked or have its
  existing chunks replaced.
- **FR-014**: During a refresh, a document whose content has changed
  MUST have its chunks replaced with newly chunked content.
- **FR-015**: A second `addSource` call for an origin already being
  indexed MUST NOT start a second, concurrent indexing run for that
  source.
- **FR-016**: This milestone's implementation MUST pass milestone 001's
  full interface contract-test suite without any modification to that
  suite, proving the interface remains implementation-agnostic.

### Key Entities

- **Source, Document, Chunk**: As defined in milestone 001 — this
  milestone is where they're persisted for the first time, rather than
  held only in memory.
- **RankedChunk**: As defined in milestone 001 — not a persisted entity.
  It's assembled fresh on every search, joining a stored `Chunk` with its
  `Document` and `Source` and a relevance score computed at query time.
  Nothing about it survives between searches; this milestone changes
  where the *chunks it's built from* live, not whether ranking itself is
  stored.

## Success Criteria

- **SC-001**: After a source is added, its status is observable as
  pending/indexing immediately, and later as ready or error, without the
  original call ever blocking on the indexing work.
- **SC-002**: Content from a successfully indexed source is searchable
  immediately after indexing completes, including after the process
  holding the index is restarted.
- **SC-003**: Milestone 001's contract-test suite passes against this
  milestone's implementation with zero changes to the suite itself.
- **SC-004**: Refreshing a source with no underlying content changes
  leaves every previously-stored chunk identical — verified by comparing
  chunk ids and content before and after a no-op refresh.
- **SC-005**: A source-level crawl failure is always observable through
  the source's status and error fields, never through a crashed process
  or an unhandled rejection.

## Assumptions

- Calling a real embedding model to *produce* embeddings is out of scope —
  deferred to milestone 005's `Embedder`, which this milestone still
  stubs. Every chunk this milestone's own crawl-and-chunk orchestration
  produces is stored with a `null` embedding. This is distinct from
  *ranking* a chunk that already has an embedding — the storage layer's
  search logic must do that correctly regardless of where the embedding
  came from, since milestone 001's contract (which this milestone must
  satisfy unmodified, FR-016) already requires it. Discovered during
  implementation; see research.md.
- The MCP server that will eventually call this implementation over
  stdio is milestone 004's concern — this milestone is exercised directly
  (e.g., by tests and by milestone 001's contract suite), not through a
  network or protocol boundary.
- "Without blocking the call" means the caller isn't forced to wait for
  crawling/chunking to finish before `addSource` returns — it does not
  imply a particular concurrency mechanism (worker threads, job queues,
  etc.); a single-process, single-daemon deployment is assumed, matching
  the constitution's existing "extreme throughput is not a v1
  requirement" stance.
- The exact schema (table/column names, virtual table definitions) is a
  planning-phase decision, starting from what's already drafted in
  `specs/000-tome-core/tdd.md`.

# Feature Specification: Core Interfaces & Data Model

**Feature Branch**: `001-core-interfaces-data-model`
**Created**: 2026-07-26
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Add a Source (Priority: P1)

A caller submits a source — a type (URL, local path, or git repo) and an
origin — to the index. The index accepts it, assigns a unique identifier,
and returns immediately with a pending status; it does not block the
caller while crawling and embedding happen in the background. Submitting
the same origin again refreshes the existing source instead of creating a
duplicate.

**Why this priority**: Nothing else is meaningful without a way to
register what should be indexed. Every other operation acts on sources
added this way.

**Independent Test**: A caller can submit a source and receive a unique
identifier with a pending or indexing status. Submitting the same origin a
second time returns the same source's identifier rather than creating a
new one.

**Acceptance Scenarios**:

1. **Given** no sources are indexed, **When** a caller submits a new
   source, **Then** the index returns a unique identifier and the source
   appears with `pending` or `indexing` status.
2. **Given** a source that has already been indexed, **When** a caller
   submits the same origin again, **Then** the index treats it as a
   refresh of the existing source rather than creating a second entry.
3. **Given** two callers submit the same new origin at nearly the same
   time, **When** both calls are processed, **Then** only one source
   record exists for that origin.

---

### User Story 2 — Search Indexed Content (Priority: P1)

A caller submits a free-text query and receives ranked results — chunks
of content with their source metadata — ordered by relevance. Results
are still returned, ranked by lexical match instead of semantic
similarity, when semantic ranking isn't available.

**Why this priority**: Retrieval is the entire point of indexing
something. Without useful search results, adding sources has no value.

**Independent Test**: A caller adds a source, waits for it to finish
indexing, then queries with text related to its content. Relevant chunks
are returned, each labeled with how it was ranked.

**Acceptance Scenarios**:

1. **Given** indexed content relevant to a query, **When** a caller
   searches, **Then** the most relevant chunks are returned in ranked
   order, each identifying whether it was ranked semantically or
   lexically.
2. **Given** semantic ranking is unavailable, **When** a caller searches,
   **Then** results are still returned, ranked lexically, without an
   error.
3. **Given** no indexed content matches a query, **When** a caller
   searches, **Then** an empty result set is returned without error.
4. **Given** no sources have been added at all, **When** a caller
   searches, **Then** an empty result set is returned without error.

---

### User Story 3 — Retrieve a Chunk or Document by Identifier (Priority: P1)

A caller provides an identifier returned by a previous search and
receives the full chunk or document text along with its source metadata.

**Why this priority**: Search results are excerpts; a caller frequently
needs the complete chunk or document behind a result before acting on it.

**Independent Test**: A caller fetches a known identifier and receives
the corresponding text. Fetching an identifier that doesn't exist returns
a clear error rather than crashing the caller's session.

**Acceptance Scenarios**:

1. **Given** a known chunk or document identifier, **When** a caller
   fetches it, **Then** the full text and its source metadata are
   returned.
2. **Given** an identifier that does not exist, **When** a caller fetches
   it, **Then** a structured error is returned, not an unhandled
   exception.

---

### User Story 4 — List Sources and Their Status (Priority: P2)

A caller lists every source that has been added, along with its type,
origin, current status, and when it was last successfully indexed.

**Why this priority**: A caller needs to check whether a source finished
indexing, is still in progress, or failed — this is how progress on the
asynchronous work started in User Story 1 becomes visible.

**Independent Test**: A caller adds a source, lists sources immediately
(sees it pending or indexing), and lists again later (sees it ready or
error, with a last-indexed timestamp if it succeeded).

**Acceptance Scenarios**:

1. **Given** one or more sources have been added, **When** a caller lists
   sources, **Then** each appears with its type, origin, status, and
   last-indexed timestamp (if it has ever completed).
2. **Given** a source that failed during indexing, **When** a caller lists
   sources, **Then** that source shows an error status with a
   human-readable explanation.

---

### Edge Cases

- What happens when a caller submits a source with an origin that's
  already indexed while a refresh of that same source is still in
  progress? The second call must not start a second, concurrent refresh —
  it attaches to the in-flight one.
- What happens when a search runs against a corpus where some content has
  semantic rankings and some doesn't (a partial embedding backlog)? Every
  matching chunk must still appear in results, each labeled with the
  ranking method that actually produced it.
- What happens when a source fails partway through indexing (e.g., a
  crawl is cut off by its bounds)? Whatever was successfully indexed
  before the failure remains searchable; the source's status reflects
  what happened without discarding the partial result.
- What happens when `fetch` is called with an identifier that never
  existed? A structured error is returned, not a crash. (Source removal
  is not part of this feature's contract — nothing in `DocumentIndex`
  deletes a source — so "removed" isn't a reachable case here.)

## Requirements

### Functional Requirements

- **FR-001**: The index MUST accept a source (a type — URL, local path,
  or git repository — plus an origin) and return a unique identifier
  immediately, without waiting for crawling or embedding to finish.
- **FR-002**: The index MUST report each source's status as one of
  pending, indexing, ready, or error, along with the timestamp it was
  last successfully indexed, if ever.
- **FR-003**: Submitting a source with an origin that already exists MUST
  NOT create a duplicate; it MUST be treated as a refresh of the existing
  source.
- **FR-004**: The index MUST return ranked results for a free-text query,
  and each result MUST identify whether it was ranked semantically or
  lexically.
- **FR-005**: The index MUST return search results even when semantic
  ranking is unavailable, falling back to lexical ranking instead of
  failing the request.
- **FR-006**: The index MUST return an empty result set, not an error,
  when a query matches nothing or no sources have been added.
- **FR-007**: The index MUST return the full text and source metadata for
  a chunk or document given its identifier.
- **FR-008**: The index MUST return a structured error, not raise an
  unhandled exception, when asked to fetch an identifier that doesn't
  exist.
- **FR-009**: The index MUST list every added source along with its type,
  origin, status, and last-indexed timestamp.
- **FR-010**: A source that fails during crawling or indexing MUST report
  an error status with a human-readable explanation rather than raising
  an exception to the caller.
- **FR-011**: The four operations (add a source, search, fetch, list
  sources) MUST be defined on a single contract that does not expose
  details of the underlying storage mechanism to callers.
- **FR-012**: The embedding contract MUST allow signaling that the
  embedding service is unavailable for a given piece of text, rather than
  raising an exception, so the index can fall back to lexical ranking.

### Key Entities

- **DocumentIndex**: The contract defining the four operations — add a
  source, search, fetch, list sources. All callers interact exclusively
  through it; it does not expose the storage mechanism behind it.
- **Embedder**: A separate contract responsible for turning text into a
  vector representation, or signaling that it can't right now. Composed
  into the index; the index delegates all embedding to it rather than
  performing it directly.
- **Source**: Something the index has been pointed at — a type, an
  origin, when it was added, when it was last successfully indexed (if
  ever), its current status, and an error explanation when status is
  error.
- **Document**: A single piece of content fetched from within a source —
  its location within that source, an optional title, a content
  fingerprint used to detect changes on refresh, and when it was fetched.
- **Chunk**: A segment of a document's text — its position within the
  document, the text itself, its vector representation (absent if not
  yet embedded), and its size.
- **RankedChunk**: A chunk returned from a search — the chunk, its parent
  document and source, a relevance score, and whether that score came
  from semantic or lexical ranking.

## Success Criteria

- **SC-001**: A caller can add, search, fetch, and list sources through
  the DocumentIndex contract without needing to know anything about the
  underlying storage or embedding mechanism.
- **SC-002**: Search returns usable results in 100% of tested scenarios
  where the embedding service is unavailable, via lexical ranking
  instead.
- **SC-003**: The contract is implementable by a second storage backend
  without any change to callers — validated by substituting a test double
  that implements the same contract in place of the real one.
- **SC-004**: Submitting an already-indexed source's origin again always
  returns the same source identifier rather than a new one, and never
  results in more than one entry for that origin appearing in the source
  list, across all tested scenarios.
- **SC-005**: Every error condition covered by this spec (unknown fetch
  identifier, failed source) is surfaced through the contract's own
  status or error fields, never an unhandled exception, across all tested
  scenarios.

## Assumptions

- The caller (the MCP server, specified separately in milestone 004)
  decides what to add and when; this contract applies no judgment of its
  own about what's worth indexing.
- A concrete Embedder is supplied to the index at construction time; this
  spec defines the Embedder contract only. Its local implementation is
  specified separately in milestone 005 (Local Embedding & Reconciliation).
- The concrete v1 implementation of DocumentIndex and its storage schema
  are specified separately in milestone 003 (SQLite Document Index).
- How a Source becomes Documents and Chunks — crawling and chunking — is
  specified separately in milestone 002 (Ingestion Pipeline). This spec
  only defines the shapes of Source, Document, and Chunk as they appear
  through the DocumentIndex contract.
- Concurrent callers are expected to be rare in v1 (a single local
  daemon); the contract must behave correctly when they occur, but high
  throughput is not a v1 requirement.

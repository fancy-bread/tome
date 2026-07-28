# Feature Specification: Local Embedding & Reconciliation

**Feature Branch**: `005-local-embedding-reconciliation`
**Created**: 2026-07-27
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Semantic Search Actually Ranks by Meaning (Priority: P1)

A user adds a source, waits for it to index, and searches it with a
query that shares no exact words with the relevant content. The result
still comes back ranked near the top, because the chunk was embedded at
write time and the query is compared against it semantically — not just
matched lexically.

**Why this priority**: This is the entire point of the milestone. Every
prior milestone built the plumbing (`sqlite-vec` schema, `search()`'s
vector-then-lexical logic, the `Embedder` interface) but nothing has ever
actually embedded a chunk outside of a test seeding one by hand. Without
this story, "semantic search" is a claim the product makes that isn't
actually true yet.

**Independent Test**: Add a source containing a passage whose meaning is
clear but whose wording doesn't overlap with a test query, wait for
indexing to finish, search with that query, and confirm the passage
ranks with `rankedBy: "vector"`, not just `"lexical"`.

**Acceptance Scenarios**:

1. **Given** a local embedding service is available, **When** a source
   finishes indexing, **Then** its chunks are stored with real
   embeddings, not `null`.
2. **Given** chunks with real embeddings, **When** a query semantically
   related to one is searched, **Then** that chunk is returned ranked by
   vector similarity.

---

### User Story 2 — Indexing Never Fails Just Because Embedding Is Down (Priority: P1)

A user adds a source while the local embedding service happens to be
unreachable. Indexing still completes — the content is crawled, chunked,
and immediately searchable by keyword — rather than the whole source
being marked as failed.

**Why this priority**: Graceful degradation is a binding constitutional
principle, not an optional nicety, and it has to hold at the exact point
this milestone introduces a new way for things to fail (a local service
that may not be running). Getting this wrong would make every source
add fragile in a way it currently isn't.

**Independent Test**: Simulate the embedding service being unavailable,
add a source, and confirm the source still reaches `ready` status with
its chunks searchable by keyword, each stored with a `null` embedding.

**Acceptance Scenarios**:

1. **Given** the local embedding service is unreachable, **When** a
   source is indexed, **Then** its chunks are stored with `null`
   embeddings and the source still reaches `ready` status.
2. **Given** chunks stored with `null` embeddings, **When** a query
   matching their text is searched, **Then** they are returned ranked by
   lexical match, with no error surfaced.

---

### User Story 3 — Content Catches Up Automatically Once Embedding Recovers (Priority: P2)

Content that was indexed while the embedding service was down later gets
embedded automatically, without the user re-adding the source or
restarting anything, once the service becomes available again.

**Why this priority**: Without this, a temporary outage in the local
embedding service would leave content permanently degraded to
keyword-only search unless a user notices and manually triggers a
refresh — a papercut serious enough to undermine trust in the "it just
works" experience, but less urgent than the two stories above since the
content is never unusable in the meantime.

**Independent Test**: Index a source while the embedding service is
unavailable so its chunks are stored with `null` embeddings, then make
the service available and confirm those chunks acquire real embeddings
without any user action beyond waiting.

**Acceptance Scenarios**:

1. **Given** chunks stored with `null` embeddings, **When** the
   embedding service becomes available while the system continues
   running, **Then** those chunks are re-attempted and acquire real
   embeddings without user intervention.
2. **Given** the system has just started up, **When** it finds chunks
   with `null` embeddings left over from before, **Then** it attempts to
   embed them as part of startup, not only on some later recurring
   schedule.
3. **Given** reconciliation is in progress, **When** a user adds a new
   source or runs a search at the same time, **Then** both complete
   normally and are not delayed or blocked by reconciliation.

---

### Edge Cases

- What happens when the embedding service is available at chunk-write
  time but becomes unavailable partway through indexing a source with
  many chunks? Each chunk's embedding attempt is independent — some may
  succeed and some may come back `null`; the source still reaches
  `ready`, and reconciliation later covers the ones that came back
  `null`.
- What happens when the embedding service returns successfully but with
  a result that doesn't match the expected shape (e.g., wrong
  dimensionality)? Treated the same as the service being unavailable —
  the chunk is stored with a `null` embedding rather than corrupting the
  vector index or failing the whole source.
- What happens when reconciliation re-attempts a chunk and the embedding
  service is still unavailable? The chunk is left with a `null`
  embedding and picked up again on the next reconciliation pass; this is
  not treated as an error.
- What happens when a document is deleted or replaced (via a source
  refresh) while its chunks are queued for reconciliation? Reconciliation
  only ever acts on chunks that currently exist; a chunk removed by a
  refresh is simply no longer a candidate.
- What happens when the same chunk is somehow picked up by two
  reconciliation passes at once (e.g., a slow embedding call overlapping
  with the next scheduled pass)? Reconciliation must not produce
  duplicate or conflicting embeddings for the same chunk from overlapping
  passes.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST attempt to compute a real embedding for
  every chunk at the time it is written during indexing, using a local
  embedding service.
- **FR-002**: When the local embedding service is unavailable at
  chunk-write time, the system MUST store the chunk with a `null`
  embedding rather than failing the chunk, the document, or the source.
- **FR-003**: A source's indexing MUST reach `ready` status regardless of
  whether the embedding service was available for any or all of its
  chunks.
- **FR-004**: A chunk stored with a `null` embedding MUST be immediately
  searchable by lexical match, with no observable error.
- **FR-005**: The system MUST periodically re-attempt embedding for every
  chunk currently stored with a `null` embedding, for as long as the
  system is running.
- **FR-006**: The system MUST also attempt this same re-embedding pass
  once at startup, so chunks left over from a prior run are not only
  covered by the recurring schedule.
- **FR-007**: A chunk whose re-attempted embedding succeeds MUST have its
  real embedding stored and become eligible for vector-ranked search from
  that point on.
- **FR-008**: A chunk whose re-attempted embedding still fails MUST
  remain searchable by lexical match and MUST remain eligible for a later
  re-attempt.
- **FR-009**: Reconciliation MUST run independently of adding a source or
  running a search — neither of those operations may be delayed or fail
  because reconciliation is in progress.
- **FR-010**: Reconciliation MUST NOT produce duplicate or conflicting
  embedding attempts for the same chunk when passes overlap.
- **FR-011**: The embedding service MUST run entirely on the local
  device by default — no chunk or query text leaves the device as part
  of computing an embedding.

### Key Entities

- **Chunk** (existing, from milestone 001): its `embedding` field moves,
  for the first time, from "always `null` outside of tests" to
  reflecting real state — `null` while unembedded or pending
  reconciliation, populated once an embedding attempt succeeds.

## Success Criteria

- **SC-001**: A query semantically related to indexed content, but
  sharing no matching keywords with it, returns that content ranked
  above unrelated keyword-only matches.
- **SC-002**: Adding a source while the local embedding service is
  unavailable completes with the source reaching `ready` status and its
  content immediately searchable, with no hang or artificial delay
  introduced by the failed embedding attempts.
- **SC-003**: Content indexed while the embedding service was down
  becomes ranked by semantic similarity within one reconciliation pass
  of the service becoming available again, with no user action beyond
  waiting.
- **SC-004**: No indexed content ever leaves the device as a side effect
  of computing its embedding.
- **SC-005**: A burst of source-adds, searches, and reconciliation
  activity happening at the same time all complete correctly, with no
  operation blocked or corrupted by another.

## Assumptions

- The local embedding service (Ollama running `nomic-embed-text`) is
  assumed to already be installed and running by the user or a separate
  setup step; installing or managing the service itself is out of scope
  for this milestone, consistent with the PRD's "local by default"
  posture.
- The embedding service is assumed reachable at a fixed local default
  location; configuring a non-default location is out of scope for v1
  (Constitution Principle V — minimal v1 scope), matching the PRD's
  Open Questions note that pluggable/API-based embedding is a later
  option, not a v1 requirement.
- "Periodically" (FR-005) means a fixed, short interval suitable for a
  long-running local daemon — exact timing is an implementation detail
  for the plan, not a product requirement; no user-facing configuration
  of this interval is in scope for v1.
- The human-facing skill files (`/tome-add`, `/tome-sources`,
  `/tome-search`) remain out of scope — milestone 006.
- Claude Code plugin packaging remains out of scope — milestone 007.
- Change-detection-based partial re-embedding on refresh (only
  re-embedding documents that actually changed) already exists from
  milestone 003's content-hash logic; this milestone only changes
  whether an embedding is actually attempted at write time, not whether
  a refresh decides to re-chunk a document.

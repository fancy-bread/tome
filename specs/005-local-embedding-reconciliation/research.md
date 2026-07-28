# Phase 0 Research: Local Embedding & Reconciliation

No `[NEEDS CLARIFICATION]` markers remained after `/speckit-specify` — this
milestone's unknowns are technical-decision research, not product
ambiguity.

## 1. Ollama HTTP API shape

**Decision**: `OllamaEmbedder.embed()` sends `POST {baseUrl}/api/embeddings`
with body `{ model: 'nomic-embed-text', prompt: text }` and reads
`response.embedding` (a `number[]`) from the JSON body. `baseUrl` defaults
to `http://localhost:11434` (Ollama's own default listen address).

**Rationale**: Ollama exposes two embedding endpoints: the original
`/api/embeddings` (singular prompt in, single `embedding` array out) and
a newer `/api/embed` (supports batched `input`, returns `embeddings: [][]`).
This milestone embeds one chunk at a time — no batching requirement in
scope (Constraints/Scale-Scope in plan.md) — so the singular endpoint is
the simpler, sufficient choice; adopting the batched endpoint later for a
performance milestone is additive, not a breaking change, since both are
implementation details fully inside `OllamaEmbedder`.

**Alternatives considered**: The batched `/api/embed` endpoint — rejected
for v1 as unnecessary complexity ahead of any evidence that sequential
calls are a real bottleneck (Principle V). An `ollama` npm client package
— rejected to avoid a new dependency for what's a single `fetch` call,
consistent with `DefaultCrawler` already calling raw HTTP directly rather
than pulling in a client library for URL sources.

## 2. Failure and malformed-response handling

**Decision**: `embed()` returns `null` — never throws — for: a network
error (Ollama not running), a non-2xx HTTP response, a response body
that fails to parse as JSON, a body missing an `embedding` field, or an
`embedding` whose length isn't exactly 768 (the fixed dimension
`vector-codec.ts` and the `chunk_vectors` schema already commit to).

**Rationale**: Constitution Principle II and the existing `Embedder`
contract (`src/core/embedder.ts`) already state "unavailability is a
return value, never a thrown exception" — this decision just enumerates
every way "unavailable or unusable" can present itself over HTTP and
maps all of them to the same outcome, per spec.md's edge case: "a result
that doesn't match the expected shape... treated the same as the service
being unavailable."

**Alternatives considered**: Throwing on malformed-but-received responses
(distinct from throwing on unreachable) — rejected because it would
require two different failure paths in every caller (`runIndexingJob`,
reconciliation, `search()`) for what is, from a caller's perspective, the
same fact: no usable embedding right now.

## 3. Where chunk-write-time embedding is called

**Decision**: In `runIndexingJob`, both chunk-insertion branches (new
document, changed document) call `await this.embedder.embed(chunk.text)`
for each `Chunk` the chunker produces, and set `chunk.embedding` to the
result before calling `insertChunk`. The chunker itself is unchanged — it
always returns `embedding: null` (its documented contract, `chunker.ts`
line 18), staying an embedding-agnostic, standalone module per Principle
IV; embedding is applied one layer up, at the point where a `Chunk` is
about to become durable.

**Rationale**: `insertChunk` already branches on `chunk.embedding` being
truthy to decide whether to write a `chunk_vectors` row — the plumbing to
persist an embedding already exists from milestone 003 and has simply
never been fed a non-null value in production. No change to
`insertChunk`, `chunkFromRow`, or the schema is needed.

**Alternatives considered**: Embedding inside `DefaultChunker.chunk()` —
rejected; it would violate Principle IV's "a Chunker is usable standalone
... with no Embedder present" (documented at the top of `chunker.ts`) and
break the existing chunker tests, which construct `DefaultChunker` with
no embedder at all.

## 4. Reconciliation mechanism

**Decision**: `SqliteDocumentIndex` runs its own reconciliation loop
internally — no new `DocumentIndex` method, no separate module the
daemon has to remember to start. The constructor:

1. Fires one reconciliation pass immediately (fire-and-forget, not
   awaited — matching the existing non-blocking `runIndexingJob` pattern
   from milestone 003), satisfying FR-006's startup pass.
2. Starts a `setInterval` that fires the same pass repeatedly, satisfying
   FR-005's recurring pass.

`close()` (already used by every test and by a real daemon shutdown)
calls `clearInterval` on that timer, so no test or process leaks a
background timer.

A private `reconciling: boolean` flag makes a pass a no-op if one is
already in flight — satisfying FR-010 (no duplicate/conflicting attempts
across overlapping passes) with the simplest possible mechanism: skip,
don't queue.

**Rationale**: This mirrors the exact shape of milestone 003's
`inFlightJobs`-guarded, non-blocking `runIndexingJob` — reusing an
already-reviewed concurrency pattern rather than inventing a new one.
Keeping reconciliation entirely inside `SqliteDocumentIndex` (rather than
exposing it through `DocumentIndex` or driving it from `src/index.ts`)
keeps the interface boundary (Principle IV) exactly where it already is:
`src/index.ts` constructs a `SqliteDocumentIndex` and never has to know
reconciliation exists.

**Alternatives considered**: Exposing a `reconcile()` method on
`DocumentIndex` for `src/index.ts` to call and schedule — rejected; it
would leak a `SqliteDocumentIndex`-specific concern ("chunks lacking a
`chunk_vectors` row") into the general interface, which
`InMemoryDocumentIndex` would then have to either implement meaninglessly
or leave unimplemented, violating interface segregation.

## 5. Reconciliation query

**Decision**: `SELECT chunks.rowid, chunks.id, chunks.text FROM chunks
LEFT JOIN chunk_vectors ON chunk_vectors.rowid = chunks.rowid WHERE
chunk_vectors.rowid IS NULL`, matching every chunk with no corresponding
`chunk_vectors` row — the exact same "no vector row = null embedding"
rule `chunkFromRow` already uses for reads.

**Rationale**: No new column or flag is needed to track "still needs
embedding" — the absence of a `chunk_vectors` row already means exactly
that, so the reconciliation query is a direct restatement of existing
state, not new state to keep in sync.

**Alternatives considered**: Adding an explicit `embedding_pending`
column to `chunks` — rejected as redundant state that could drift from
the `chunk_vectors` table's actual contents.

## 6. Test seam for reconciliation timing

**Decision**: `SqliteDocumentIndexOptions` gains an optional
`reconciliationIntervalMs` (default a fixed production value, e.g.
30000ms). Tests construct with a very small value (e.g. 20ms) and poll
briefly afterward — the same `waitUntilReady`-style short-poll pattern
already used in `tests/mcp/end-to-end.test.ts` — rather than waiting on
a real 30-second timer.

**Rationale**: This is a test seam, not a product configuration surface
— it is never read from an environment variable or exposed to the end
user, keeping Principle V's "no configuration surface" intact while still
letting the recurring-pass behavior (distinct from the startup pass) be
exercised deterministically and quickly in the test suite.

**Alternatives considered**: Testing only the startup pass and asserting
the recurring interval exists by code inspection — rejected; the project's
established standard is to prove behavior with a real, if accelerated,
timer firing, not to take the interval's existence on faith.

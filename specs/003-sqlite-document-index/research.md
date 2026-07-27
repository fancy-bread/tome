# Phase 0 Research: SQLite Document Index

No `[NEEDS CLARIFICATION]` markers remained in Technical Context — the
constitution already names `better-sqlite3` and `sqlite-vec`. What
follows is everything else this milestone had to resolve.

## Matching "the same document" across crawls

**Decision**: A document's natural key across repeated crawls of the same
source is `(sourceId, uri)`, not `Document.id`. On refresh, look up an
existing row by that pair: if found and `contentHash` matches, leave it
and its chunks untouched (FR-013); if found and `contentHash` differs,
keep the *same* `Document.id` but update its metadata and replace its
chunks (FR-014); if not found, insert as new using the id the crawler
generated for it.

**Rationale**: Milestone 002's `DefaultCrawler` calls `randomUUID()` for
every `Document.id` on every single crawl — there is no stable id across
two separate `crawl()` calls for the same file/page. Without treating
`(sourceId, uri)` as the real identity, every refresh would look like "all
new documents, nothing matched," making FR-013's unchanged-content
skip impossible to implement at all.

**Alternatives considered**: Changing the crawler to derive a stable,
deterministic id from `(sourceId, uri)` instead of `randomUUID()`
(rejected — reopens milestone 002, which is merged and out of scope;
also the crawler has no reason to know about identity stability, since
in milestone 002's own scope every crawl is a one-shot, standalone
operation with no notion of "previous" run to stay stable against).

## What happens to documents that disappear from a source

**Decision**: A document that existed in a previous successful index but
is absent from a new crawl (e.g., a page was deleted from a site) is left
in place — not deleted, not marked stale. This is a known, explicitly
accepted v1 simplification.

**Rationale**: Neither spec.md nor `tdd.md` addresses this case, and it
doesn't have a "no reasonable default" quality that would justify a
`[NEEDS CLARIFICATION]` — leaving old content in place is the
conservative choice (no data loss, and stale search results are a lesser
problem than a bug that silently deletes content on a flaky crawl).
Recorded here explicitly so it isn't a silent gap: real staleness
cleanup (tombstoning removed documents) is future work, not this
milestone's job.

**Alternatives considered**: Deleting documents/chunks no longer present
in a fresh crawl (rejected — riskier: a partial or bounded crawl that
simply didn't reach a page shouldn't be able to delete that page's
already-indexed content; distinguishing "genuinely removed" from
"not reached this time" isn't solvable with what milestone 002's
`CrawlResult` currently reports).

## Non-blocking `addSource` and concurrent-refresh dedup

**Decision**: `addSource()` writes the `Source` row synchronously
(`better-sqlite3` is synchronous), then invokes an internal
`runIndexingJob(source)` *without* awaiting it, storing the resulting
promise in an in-process `Map<sourceId, Promise<void>>`. The job's
promise always resolves (its own internal try/catch turns any failure
into a `status: 'error'` write) — it is never allowed to reject, so
nothing ever produces an unhandled rejection. A second `addSource` call
for an origin already present in that map returns the existing `Source`
row without starting a second job (FR-015).

**Rationale**: This is the direct implementation of Constitution
Principle II's "not thrown as exceptions that crash the daemon" for this
milestone's specific failure surface (a background job with no caller
left to catch a rejection). The in-flight map is process-local state,
consistent with the constitution's existing "single local daemon"
assumption — no cross-process coordination is needed for v1.

**Alternatives considered**: A real job queue (BullMQ, a worker-thread
pool) (rejected — Principle V; nothing about v1's scale requires it, and
the constitution already says extreme throughput isn't a v1 requirement);
tracking in-flight jobs in the database itself (rejected — the `status:
'indexing'` field already communicates this to any external observer;
a second in-memory structure is only needed to avoid double-starting
work within the same process, which persisted state doesn't help with).

## FTS5 relevance scoring sign convention

**Decision**: FTS5's built-in `bm25()` function returns *lower is more
relevant* (it's a cost, not a score). `search()` computes `score` as
`-bm25(chunk_text_fts)` so that, consistent with `RankedChunk.score`
having no documented sign convention but every other part of this
project treating "higher is better" as the natural default, higher
always means more relevant here too.

**Rationale**: Milestone 001's `RankedChunk.score` type is just `number`
with no documented ordering — this milestone is what fixes that
ambiguity in practice. Negating `bm25()` once, in one place, means
callers never need to know FTS5's own inverted convention.

**Alternatives considered**: Exposing `bm25()`'s raw (negative) value
directly (rejected — leaks an FTS5-specific implementation detail through
the interface-agnostic `RankedChunk` type, which is exactly what
Principle IV asks this milestone to avoid).

## FTS5 query sanitization

**Decision**: A user-supplied `query` string is split into whitespace-
separated tokens, each token is double-quoted (FTS5 string literal
syntax) and escaped by doubling any embedded `"`, and the quoted tokens
are joined with a space (FTS5's implicit `AND` between bareword/quoted
terms).

**Rationale**: FTS5's `MATCH` operand has its own query-syntax grammar
(`AND`/`OR`/`NOT`/`NEAR`/prefix `*`/column filters). Passing a caller's
raw text through unescaped means any of those characters in ordinary
search text (e.g., a query containing a literal `-` or `"`) either
throws a syntax error or silently changes meaning. Quoting every token
treats the whole query as literal phrase-per-word matching, which is the
safe, predictable default for v1.

**Alternatives considered**: Passing the query through raw (rejected —
a search for `error: "connection failed"` would throw an FTS5 syntax
error instead of returning results, which fails FR-009's "never an error"
requirement for a completely ordinary query); building a full
query-syntax translator supporting phrase search, exclusion, etc.
(rejected — Principle V scope; nothing in spec.md asks for search-syntax
features beyond "return matching chunks").

## Test database strategy

**Decision**: `SqliteDocumentIndex`'s constructor takes a `dbPath`
parameter. Most tests use `:memory:` (fast, fully isolated per
connection, zero cleanup). The one test that needs to prove data survives
a restart (SC-002) uses a real temp file: open an instance, index
something, close it, open a *new* instance against the same path, and
confirm the data is there — `:memory:` can't prove this, since two
`:memory:` connections are always independent databases.

**Rationale**: Matches the same pattern already used successfully in
milestones 001 (in-memory fake) and 002 (local HTTP server / real local
git repo) — prefer the fastest real thing over a mock, reserve the
slower/heavier setup (a real file) for the one test that specifically
needs it.

**Alternatives considered**: Using a temp file for every test (rejected —
slower and needs cleanup for no benefit in the tests that don't care about
cross-process persistence).

## A second-order failure the try/catch design didn't originally cover

**Discovered during implementation, by a test**: `runIndexingJob`'s
try/catch (research.md's own "non-blocking `addSource`" decision, above)
assumed the `catch` block's own cleanup — writing `status: 'error'` to
`sources` — could never itself fail. It can: if the `SqliteDocumentIndex`
is closed while a background job is still running (a real scenario, not
just a test artifact — a caller closing the index during shutdown has no
way to know a job is mid-flight), the `catch` block's own `db.prepare()`
call throws "database connection is not open," and *that* escapes
uncaught, since it's outside the try it was supposed to be inside. This
is precisely the class of bug F1 (from `/speckit-analyze`) was about —
error-handling code whose own failure path isn't itself handled — just a
different instance of it, caught by `orchestration.test.ts`'s first test
rather than by static analysis. Fixed by nesting a second try/catch
around the error-recording `UPDATE`, swallowing a failure there as
unrecoverable-and-inconsequential (if the connection is closed, no
caller can observe the status field anyway).

## TestableDocumentIndex had to move into src/

**Discovered during implementation**: `contracts/sqlite-document-index.ts`
originally had `SqliteDocumentIndex` import `TestableDocumentIndex` from
`tests/contract/document-index.contract.ts` (where milestone 001's
`/speckit-analyze` remediation had placed it). That broke
`npm run build`: `tsconfig.build.json`'s `rootDir: 'src'` requires every
file in the type-check graph — including files only needed for
`import type` — to live under `src/`, and `tests/` doesn't.

**Fix**: Moved `TestableDocumentIndex`/`DocumentIndexTestSeed` into a new
`src/core/testable-document-index.ts`. `tests/contract/document-index.contract.ts`
now imports and re-exports it from there instead of defining it locally —
a mechanical relocation, not a change to the suite's test logic or
assertions, so it doesn't conflict with FR-016's "unmodified" requirement.
`InMemoryDocumentIndex` (milestone 001) picks up the same type through
the re-export, unchanged.

**Rationale**: The dependency direction was backwards. A type describing
what a production class must implement belongs in `src/`, with tests
importing it — not the reverse. This was only visible once a second `src/`
class (`SqliteDocumentIndex`) tried to implement it and the *build*
(not `tsc --noEmit`, which doesn't enforce `rootDir`) caught the
violation.

## Open implementation-time verification

`sqlite-vec`'s exact Node loading API (`sqliteVec.load(db)` or similar)
and whether `better-sqlite3`'s prebuilt binary includes FTS5 by default
are both very likely true based on each package's stated purpose, but
weren't executed and confirmed during planning — consistent with how
milestone 002 discovered `pdf-parse`'s actual API only once real code
was written against it. `/speckit-implement` should verify both against
the installed package versions before writing `schema.ts`, and treat any
mismatch the same way milestone 002 did: fix it, document the deviation,
move on.

Both confirmed working during implementation. Two further things were
discovered only once real code ran against the installed packages:

**sqlite-vec's actual bind types**: `vec0`'s `rowid` column rejects a
plain JS number bound via `better-sqlite3` ("Only integers are allowed
for primary key values") — it requires a `BigInt`. The `embedding` column
rejects a JSON array string; it requires a raw buffer of packed
float32 bytes (`Buffer.from(new Float32Array(values).buffer)`). Neither
is documented in the package's `.d.ts`; both were confirmed by writing a
throwaway script against the real installed version before committing to
`schema.ts`/`vector-codec.ts`.

**This milestone needed real vector search after all**: planning assumed
search would be FTS5-only in this milestone (real embeddings are
milestone 005's job). But milestone 001's reused contract-test suite
(FR-016 requires it run *unmodified*) includes a test that seeds a chunk
with an explicit embedding and expects `rankedBy: 'vector'` for it —
`Embedder`-having-no-real-implementation-yet and
`chunk-having-an-embedding-already` turned out to be different things.
`SqliteDocumentIndex.search()` therefore does implement real KNN ranking
via `chunk_vectors` (falling back to FTS5 for chunks with no embedding,
or whenever the query embedding is unavailable) — the same
degrade-to-lexical branching `InMemoryDocumentIndex` already used in
milestone 001. What's still deferred to milestone 005 is *having a real,
non-stub `Embedder`* — the query/storage logic for embeddings that
already exist had to exist now, because the interface itself already
promised it. See `vector-codec.ts` for the corollary: `vec0`'s fixed
768-dimension column means the suite's short synthetic test vectors are
zero-padded to fit, which preserves relative ranking distances but not
exact round-trip fidelity for non-768-dimensional inputs — an accepted
limitation, since real embeddings are always exactly 768-dimensional.

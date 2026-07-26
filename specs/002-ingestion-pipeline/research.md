# Phase 0 Research: Ingestion Pipeline (Crawler + Chunker)

No `[NEEDS CLARIFICATION]` markers remained in Technical Context — the
constitution's Technology Constraints already name `cheerio`, `turndown`,
`pdf-parse`, and `simple-git`, so those aren't open decisions here. What
follows is everything else this milestone had to resolve.

## Data flow: where does fetched text live?

**Decision**: The crawler pairs each `Document` (metadata only, per
milestone 001's type) with its raw extracted text in a `CrawledDocument`,
and hands that text to the chunker directly. Text is never persisted
outside of `Chunk.text`.

**Rationale**: Milestone 001's `Document` type has no text/content field —
by design, matching the SQL schema in `tdd.md` where the `documents` table
has no text column but `chunks` does. Chunks are the only durable
text-bearing unit. If the crawler tried to persist full text on `Document`
itself, it would contradict a decision milestone 001 already locked in.

**Alternatives considered**: Adding a `content` field to `Document`
(rejected — would require amending milestone 001's already-implemented and
merged type, and duplicates what chunks already store); having the
chunker re-fetch content itself (rejected — re-couples the chunker to
crawling, violating the "usable independently" requirement in FR-012).

## HTTP fetching

**Decision**: Node 24's built-in global `fetch`. No HTTP client dependency.

**Rationale**: Node has shipped a spec-compliant `fetch` since v18,
stable well before the v24 baseline this project targets. Adding `axios`
or `node-fetch` would be a dependency for something the runtime already
provides.

**Alternatives considered**: `undici` directly (rejected — global `fetch`
*is* undici under the hood on modern Node; using it directly adds nothing);
`axios` (rejected — unnecessary weight and a promise-interop layer for
a need `fetch` already satisfies).

## Directory walking

**Decision**: `fs.promises.readdir(path, { recursive: true, withFileTypes:
true })`. No `glob`/`fast-glob` dependency.

**Rationale**: Recursive `readdir` has been stable since Node 20.1 — well
within this project's Node 24 baseline. Filtering by extension (`.md`,
`.txt`, `.pdf`) on the results is a one-line `.filter()`; a glob library
would add a dependency for pattern-matching flexibility this feature
doesn't need (fixed, small extension list, not user-configurable patterns).

**Alternatives considered**: `fast-glob` (rejected — the extension list is
fixed and short; glob syntax is overkill); a hand-rolled recursive walker
using `fs.readdir` without the `recursive` option (rejected — reimplements
what the runtime now does natively).

## Content fingerprint

**Decision**: `crypto.createHash('sha256')` over the extracted text,
matching `tdd.md`'s existing field definition for `Document.contentHash`
("SHA-256 of raw fetched content").

**Rationale**: Already decided in the technical design; this milestone
just implements it. SHA-256 is built into Node (`node:crypto`), no
dependency needed.

**Alternatives considered**: HTTP-level change detection via `ETag`/
`If-None-Match` for URL sources specifically (considered per a design
discussion during spec review) — rejected as the *primary* mechanism
because local path and git sources have no concept of an ETag; a uniform
fetch-then-hash approach is the only one that gives `contentHash` the same
meaning across all three source types (FR-006, FR-013). Conditional-request
support remains a plausible future bandwidth optimization but is out of
scope here — it would only skip the fetch step, not replace the hash
comparison, since ETags aren't universally reliable.

## Token-count approximation

**Decision**: Approximate `Chunk.tokenCount` as `Math.ceil(text.length /
4)` — a common English-text heuristic (~4 characters per token).

**Rationale**: FR-009 targets "approximately 500 tokens" — an approximation
satisfies an approximate target. A real tokenizer (`tiktoken`,
`gpt-tokenizer`) would need a WASM binary or a meaningful pure-JS
dependency for accuracy this milestone doesn't require; exact token
budgeting only starts to matter once real embeddings (milestone 005) or
context-window packing are in play.

**Alternatives considered**: `gpt-tokenizer` (pure JS, no WASM) (rejected
for now — real dependency weight for a target explicitly qualified as
"approximately" in the spec; revisit if milestone 005 or later needs exact
counts); word count directly as a proxy for tokens (rejected — English
tokenization is closer to ~4 chars/token than 1:1 with words, especially
for code blocks, which this project's documentation corpus includes
heavily).

## URL crawl algorithm

**Decision**: Breadth-first traversal from the starting URL. Depth 0 is
the starting page; each hop increases depth by 1. A link is followed only
if its origin (scheme + host + port) matches the starting URL's origin
*and* its path starts with the starting URL's path prefix (the starting
path up to its last `/`). Traversal stops enqueueing new links once
`maxDepth` is reached and stops fetching entirely once `maxPageCount`
documents have been fetched — whichever bound is hit first (per spec.md's
edge case).

**Rationale**: BFS naturally expresses "depth" as hop count from the
start, matching FR-002's plain-language bound. Origin+path-prefix
matching is the same restriction named in `tdd.md`'s Crawler table
("Same-origin + path-prefix restriction").

**Alternatives considered**: Depth-first traversal (rejected — depth
bounds are less intuitive to reason about and test with DFS; a single
deep branch could exhaust the page-count bound before breadth is
explored, which is a worse default for documentation sites that are
usually wide, not deep).

## Testing strategy: no real network, no mocked libraries

**Decision**: Test URL crawling against a local `http.createServer`
fixture (loopback only); test git crawling against a real local git
repository created fresh in a temp directory per test (real `git`
binary, no network); test PDF extraction against one small real PDF
fixture file checked into `tests/ingestion/fixtures/`.

**Rationale**: This avoids two bad options: real network calls in tests
(flaky, slow, offline-unfriendly, and CI-nondeterministic) and mocking
`cheerio`/`turndown`/`pdf-parse`/`simple-git` internals (brittle, tests
the mock instead of the integration). A local HTTP server and a local git
repo are both real, fast, and fully deterministic — the same technique
already used for milestone 001's in-memory `DocumentIndex` test double,
just applied to I/O boundaries instead of storage.

**Alternatives considered**: Mocking `fetch`/`simple-git` with
Vitest's `vi.mock` (rejected — would validate that the code calls the
mock correctly, not that it handles real HTML/git output correctly, which
is the actual risk in a crawler); recording real network fixtures with a
tool like `nock` (rejected — adds a dependency and a recording/playback
step for something a 20-line local HTTP server already solves).

## Distinguishing "clone this" from "already a local working tree"

**Decision** (discovered during implementation): An `origin` is treated as
something to clone if it's URL-shaped (`scheme://...`, including
`file://`, or an scp-like `git@host:path` form); anything else is treated
as an existing local working tree and walked directly, no clone attempted.

**Rationale**: The original plan considered probing the filesystem for a
`.git` entry at `origin` to decide "already a local clone." That doesn't
work — a path a caller wants *cloned from* (e.g. another local repo used
as a source) also has a `.git` entry, so filesystem probing can't
distinguish the two intents at all. Origin *format* can: a plain
filesystem path is unambiguously "use this tree as-is" (matching the
PRD's "an existing local clone" case), while anything URL-shaped —
including `file://` for local-repo test fixtures — is unambiguously
"clone this first." This also made the two cases independently testable
without network: a `file://` URL pointing at a local fixture repo
exercises the clone path with zero network access.

**Alternatives considered**: Filesystem probing for `.git` (rejected —
see above, doesn't distinguish caller intent); requiring callers to pass
an explicit `alreadyCloned: boolean` flag (rejected — adds a parameter
`CrawlInput` doesn't otherwise need, when the origin's own format already
disambiguates it unambiguously).

## Title extraction

**Decision**: The first Markdown-style heading (`# ...`) found in the
extracted text becomes `Document.title`; if none exists, `title` is
`null`.

**Rationale**: All three source types converge on Markdown-ish text by
the time the crawler is done (HTML is converted via `turndown`; `.md`
files are already Markdown; `.txt`/PDF text won't have headings and will
correctly fall back to `null`). One heuristic, applied uniformly, needs
no per-source-type special-casing.

**Alternatives considered**: Using the HTML `<title>` tag for URL sources
specifically (rejected — inconsistent with path/git sources, which have
no equivalent, and `<title>` often differs from the actual first heading
in documentation sites); using the filename for path/git sources
(rejected as primary — reasonable as a fallback, but the spec doesn't
require a filename fallback and `null` is an equally valid "no title"
signal per milestone 001's `Document.title: string | null` contract).

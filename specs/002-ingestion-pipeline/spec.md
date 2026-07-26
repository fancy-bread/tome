# Feature Specification: Ingestion Pipeline (Crawler + Chunker)

**Feature Branch**: `002-ingestion-pipeline`
**Created**: 2026-07-26
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Crawl a URL Source (Priority: P1)

A caller points the crawler at a URL. It fetches that page and, within the
same origin and path prefix, up to a bounded depth and page count, produces
one Document per page fetched.

**Why this priority**: URL sources are the most common way a caller would
point Tome at external documentation. Without a working URL crawl, the
Document/Chunk types from milestone 001 have nothing real feeding them.

**Independent Test**: Point the crawler at a small, bounded test site;
confirm it returns a Document for each page within scope and none from
outside the starting origin/path prefix.

**Acceptance Scenarios**:

1. **Given** a URL within a small site, **When** the crawler runs, **Then**
   it returns a Document for the starting page and every page reachable
   from it within the same origin and path prefix.
2. **Given** a page linked from the starting URL but on a different origin,
   **When** the crawler runs, **Then** that page is never fetched or
   included in the results.
3. **Given** a site whose structure would exceed the configured depth or
   page-count bounds, **When** the crawler runs, **Then** it stops at the
   bound and returns the Documents already fetched, rather than failing.

---

### User Story 2 — Crawl a Local Path Source (Priority: P1)

A caller points the crawler at a local directory. It walks the directory
and produces one Document per Markdown, text, or PDF file found.

**Why this priority**: Local documentation (READMEs, internal wikis
checked out to disk, exported PDFs) is a first-class source type alongside
URLs, named explicitly in the product's target use cases.

**Independent Test**: Point the crawler at a directory containing a mix of
`.md`, `.txt`, `.pdf`, and unrelated files; confirm a Document is produced
for each matching file and none for the rest.

**Acceptance Scenarios**:

1. **Given** a directory containing `.md`, `.txt`, and `.pdf` files,
   **When** the crawler runs, **Then** it returns one Document per matching
   file, including files in subdirectories.
2. **Given** a directory containing files of other types (e.g. `.png`,
   `.json`), **When** the crawler runs, **Then** those files are excluded
   from the results.
3. **Given** a path that doesn't exist or can't be read, **When** the
   crawler runs, **Then** it reports the failure clearly rather than
   crashing, and produces no Documents for that source.

---

### User Story 3 — Crawl a Git Repository Source (Priority: P1)

A caller points the crawler at a git repository — a remote URL or an
existing local clone. The crawler ensures a local working tree is
available and walks it for the same file types as a local path source.

**Why this priority**: Git repos are named alongside URLs and local paths
as a core v1 source type — ADRs and runbooks frequently live in a repo
rather than a rendered site.

**Independent Test**: Point the crawler at a small local git repository
(or an existing clone of one); confirm it returns a Document for each
matching file in the working tree.

**Acceptance Scenarios**:

1. **Given** a git repository URL not yet cloned locally, **When** the
   crawler runs, **Then** it obtains a local working tree and returns a
   Document per matching file in it.
2. **Given** an existing local clone of a repository, **When** the
   crawler runs, **Then** it uses that clone directly rather than cloning
   again, and returns the same Documents a fresh clone would produce.
3. **Given** a repository URL that cannot be reached or cloned, **When**
   the crawler runs, **Then** it reports the failure clearly rather than
   crashing, and produces no Documents for that source.

---

### User Story 4 — Chunk a Document (Priority: P1)

A caller passes a Document's text to the chunker. It splits the text into
overlapping Chunks, preferring to break at headers or paragraph
boundaries over splitting mid-sentence or mid-code-block, with each
Chunk's position recorded for stable ordering.

**Why this priority**: Chunks, not whole documents, are what gets searched
and returned. Without chunking, nothing downstream (storage, embedding,
search) has anything to operate on.

**Independent Test**: Chunk a multi-section document with headers; confirm
the resulting chunks respect header/paragraph boundaries where possible,
overlap with their neighbors, and are numbered in stable, increasing order.

**Acceptance Scenarios**:

1. **Given** a document with multiple headed sections, **When** it is
   chunked, **Then** chunk boundaries fall at header or paragraph breaks
   wherever the section allows it, not mid-sentence or mid-code-block.
2. **Given** two adjacent chunks from the same document, **When** their
   text is compared, **Then** they share an overlapping region rather than
   picking up exactly where the previous one left off.
3. **Given** the same unchanged document text chunked twice, **When** the
   results are compared, **Then** every chunk's ordinal and text are
   identical both times.
4. **Given** document text shorter than one chunk's target size, **When**
   it is chunked, **Then** exactly one chunk is produced.
5. **Given** empty document text, **When** it is chunked, **Then** zero
   chunks are produced.

---

### User Story 5 — Skip Unchanged Content on Refresh (Priority: P2)

A caller re-crawls a source it has already fetched before. For any file or
page whose content hasn't changed since it was last fetched, the crawler
signals this via the Document's content fingerprint, so the caller can
skip re-chunking it.

**Why this priority**: Named in the product plan as a fast-follow rather
than a hard v1 requirement — refreshing is a real workflow, but the crawl
and chunk mechanics from User Stories 1–4 are useful on their own even
without this optimization.

**Independent Test**: Crawl the same unchanged source twice; confirm the
Documents produced the second time carry identical content fingerprints
to the first. Change one file's content and re-crawl; confirm only that
file's Document gets a new fingerprint.

**Acceptance Scenarios**:

1. **Given** a source crawled once already, **When** it is crawled again
   with no content changes, **Then** every Document's content fingerprint
   matches what was produced the first time.
2. **Given** a source where exactly one file changed since the last crawl,
   **When** it is crawled again, **Then** only that file's Document
   receives a new content fingerprint — all others match the prior crawl.

---

### Edge Cases

- What happens when a single page or file fails to fetch or parse partway
  through a crawl (e.g., a broken link, a corrupt PDF)? The crawler skips
  it and continues; Documents for everything else that succeeded are still
  returned.
- What happens when a URL crawl's starting page itself can't be fetched?
  The crawl produces zero Documents and reports the failure clearly,
  rather than crashing.
- What happens when a local path or git source contains no matching files
  at all? Zero Documents are produced, without error.
- What happens when a local path source doesn't exist or can't be read
  (e.g., a typo'd path, a permissions error)? This is a source-level
  failure like an unreachable URL or an unclonable repo — the crawler
  reports it clearly and produces zero Documents, rather than crashing.
- What happens when depth and page-count bounds are both configured and
  either one is hit first? Whichever bound is reached first stops the
  crawl; the other bound is irrelevant to that run.

## Requirements

### Functional Requirements

- **FR-001**: The crawler MUST, for a URL source, fetch only pages within
  the same origin and path prefix as the starting URL.
- **FR-002**: The crawler MUST bound a URL crawl by a maximum depth
  (default: 3) and a maximum page count (default: 200), both configurable,
  and MUST stop crawling as soon as either bound is reached.
- **FR-003**: When a URL crawl is stopped by its bounds, the crawler MUST
  return the Documents already fetched rather than failing the operation.
- **FR-004**: The crawler MUST, for a local path source, produce one
  Document per Markdown (`.md`), text (`.txt`), or PDF (`.pdf`) file found
  by walking that directory, including subdirectories.
- **FR-005**: The crawler MUST, for a git source, obtain a local working
  tree (using an existing local clone if one is provided, cloning fresh
  otherwise) and walk it for the same file types as a local path source.
- **FR-006**: Every Document the crawler produces MUST include a content
  fingerprint that changes if and only if that document's content changed
  since it was last fetched.
- **FR-007**: The crawler MUST continue past any single file or page it
  cannot fetch or parse, producing Documents for everything else that
  succeeded, rather than failing the entire crawl.
- **FR-008**: The crawler MUST report a source-level failure (e.g., an
  unreachable or unclonable git repository, an unfetchable starting URL,
  or a local path that doesn't exist or can't be read) clearly rather
  than crashing, producing zero Documents for that attempt.
- **FR-009**: The chunker MUST split a Document's text into overlapping
  Chunks, targeting a default chunk size of approximately 500 tokens with
  approximately 15% overlap between adjacent chunks, preferring header or
  paragraph boundaries over splitting mid-sentence or mid-code-block.
- **FR-010**: Each Chunk the chunker produces MUST record its ordinal
  position within its Document; chunking the same unchanged text MUST
  always produce the same ordinals and text.
- **FR-011**: The chunker MUST produce exactly one Chunk for Document text
  shorter than a single chunk's target size, and zero Chunks for empty
  text.
- **FR-012**: The crawler and chunker MUST each be usable independently of
  any storage or embedding implementation — a caller can invoke them and
  receive Documents and Chunks without a DocumentIndex or Embedder present.
- **FR-013**: For a source that has been crawled before, the crawler MUST
  produce an identical content fingerprint for each file or page whose
  content hasn't changed, and a different fingerprint for any that has.

### Key Entities

- **Document**: As defined in milestone 001 — produced here by the
  crawler, with its `contentHash` field populated per FR-006/FR-013.
- **Chunk**: As defined in milestone 001 — produced here by the chunker,
  with `embedding` left `null` (assigning embeddings is milestone 005's
  concern) and `ordinal` set per FR-010.
- **Crawl Bounds**: The configuration governing a URL crawl's extent — a
  maximum depth and a maximum page count, each with a default and each
  independently reachable as the stopping condition (FR-002).

## Success Criteria

- **SC-001**: Crawling a bounded test site produces a Document for every
  page within the starting origin and path prefix, and never one from
  outside it.
- **SC-002**: A crawl that would otherwise exceed its configured bounds
  always completes with whatever it fetched before the limit was reached,
  across all tested scenarios — it never fails outright because of its own
  bounds.
- **SC-003**: Crawling the same unchanged local file, directory, or page
  twice always produces identical content fingerprints; crawling changed
  content always produces a different one, across all tested scenarios.
- **SC-004**: Chunking the same unchanged Document text twice always
  produces identical ordinals and text for every chunk, across all tested
  scenarios.
- **SC-005**: A single file or page that fails to fetch or parse during a
  crawl never prevents the rest of that crawl's content from being
  returned, across all tested scenarios.

## Assumptions

- The chunk-size and overlap-percentage defaults (FR-009) are the starting
  values already named in the technical design; the product plan flags
  the exact numbers as tunable, not fixed — this spec requires the
  behavior (overlapping, boundary-aware, stable ordinals), not that these
  specific numbers survive unchanged into later milestones.
- Real network fetching, HTML parsing, PDF parsing, and git operations are
  implementation choices decided in the planning phase, not this spec —
  this spec defines what the crawler and chunker must do, not which
  libraries do it.
- Persisting Documents or Chunks to storage is out of scope — that's
  milestone 003 (SQLite Document Index). This milestone's crawler and
  chunker are pure producers a caller invokes and receives results from
  directly.
- Assigning embeddings to chunks is out of scope — that's milestone 005
  (Local Embedding & Reconciliation). Chunks produced here always have a
  `null` embedding.
- User Story 5 (skip-unchanged-content) is a should-have per the product
  plan, not a hard requirement for this milestone to be considered done —
  included here at P2 because it falls out naturally from FR-006's content
  fingerprint with no additional mechanism required.

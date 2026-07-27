# Quickstart: SQLite Document Index

Validates that `SqliteDocumentIndex` is a real, drop-in second backend
for the `DocumentIndex` contract — proving FR-016/SC-003 — and that its
storage-specific behavior (orchestration, refresh, persistence) works.

## Prerequisites

- Node.js 24 LTS, dependencies installed: `npm install` (adds
  `better-sqlite3` and `sqlite-vec` as runtime dependencies,
  `@types/better-sqlite3` as a dev dependency)

## What gets validated

```
tests/storage/
├── sqlite-document-index.test.ts   # runDocumentIndexContractTests(...) — same suite as milestone 001
├── orchestration.test.ts            # crawl → chunk → persist, status transitions
├── refresh.test.ts                   # change-detection, concurrent-refresh dedup
└── persistence.test.ts                # close + reopen against the same file
```

## Run it

```bash
npm test
```

## Expected outcome

All tests pass, specifically covering:

- **SC-003** (the headline result) — `tests/storage/sqlite-document-index.test.ts`
  imports `runDocumentIndexContractTests` from
  `tests/contract/document-index.contract.ts` **unchanged** and calls it
  with `() => new SqliteDocumentIndex({ dbPath: ':memory:', embedder })`.
  Every one of milestone 001's 17 contract tests passes against real
  SQLite, with zero edits to the suite itself.
- **SC-001** — `orchestration.test.ts`: adding a source against a local
  path/URL fixture (reusing milestone 002's fixture techniques — a local
  HTTP server or temp directory) shows `pending`/`indexing` immediately,
  then `ready` with a `lastIndexedAt` once the background job finishes.
- **SC-005** — `orchestration.test.ts`: a source whose crawl fails at the
  source level settles to `error` with the crawl's message, and the test
  process never sees an unhandled rejection.
- **SC-004** — `refresh.test.ts`: refreshing an unchanged source leaves
  every chunk's id and text identical; changing one document and
  refreshing again replaces only that document's chunks.
- **SC-002** — `persistence.test.ts`: index a source against a temp-file
  database, close the index, open a new `SqliteDocumentIndex` against the
  same file path, and confirm `listSources()`/`search()` see the same
  data without re-indexing.

## Type-checking

```bash
npx tsc --noEmit
```

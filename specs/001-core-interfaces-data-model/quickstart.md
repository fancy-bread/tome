# Quickstart: Core Interfaces & Data Model

Validates that the contracts in `contracts/` are actually satisfiable —
i.e., that the success criteria in spec.md hold for at least one
implementation, before any real storage or embedding code exists.

## Prerequisites

- Node.js 24 LTS
- Repo cloned, dependencies installed: `npm install`

## What gets validated

`tests/contract/document-index.contract.ts` exports a single
function, `runDocumentIndexContractTests(makeIndex)`, that exercises every
acceptance scenario in spec.md's four user stories against whatever
`DocumentIndex` the caller supplies. This feature wires it to an
in-memory fake:

```
tests/contract/
├── document-index.contract.ts   # the shared suite (spec.md's scenarios, as tests)
├── in-memory-document-index.ts  # test double implementing DocumentIndex + Embedder
└── document-index.test.ts       # runDocumentIndexContractTests(() => new InMemoryDocumentIndex())
```

## Run it

```bash
npm test
```

## Expected outcome

All tests pass, specifically covering:

- **SC-001** — add, search, fetch, and list all work through the
  interface alone (the test double's internals never leak into the
  assertions).
- **SC-002** — a variant of the in-memory fake with its `Embedder`
  returning `null` still returns search results, labeled `rankedBy:
  'lexical'`.
- **SC-004** — calling `addSource` twice with the same `origin` results
  in exactly one entry from `listSources()`.
- **SC-005** — fetching an unknown id rejects with `NotFoundError`
  (caught in the test, not an uncaught process exception); an `error`-
  status source never throws when listed.

## Proving SC-003 (the point of this feature)

SC-003 — "implementable by a second backend without any change to
callers" — isn't fully provable until a second backend exists. This
quickstart only proves the suite *can* run against an implementation.
The proof of portability completes in milestone 003, when
`document-index.contract.ts` is imported unchanged and re-run against
`SqliteDocumentIndex`:

```bash
# in milestone 003, not this feature:
runDocumentIndexContractTests(() => new SqliteDocumentIndex(/* ... */));
```

If that later run requires editing `document-index.contract.ts` itself,
SC-003 has failed and the interface needs revisiting — the suite passing
unmodified against a second implementation *is* the success criterion.

## Type-checking

```bash
npx tsc --noEmit
```

Confirms the interface and type declarations compile with no errors and
no implicit `any` leaking implementation details into the public shapes.

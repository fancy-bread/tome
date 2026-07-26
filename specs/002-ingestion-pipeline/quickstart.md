# Quickstart: Ingestion Pipeline (Crawler + Chunker)

Validates that the `Crawler` and `Chunker` contracts in `contracts/` work
end-to-end against real (but local, fixture-driven) inputs for all three
source types, with no storage or embedding present — proving FR-012.

## Prerequisites

- Node.js 24 LTS, dependencies installed: `npm install` (adds `cheerio`,
  `turndown`, `pdf-parse`, `simple-git` as runtime dependencies)
- `git` available on `PATH` (already required to work on this repo at all)

## What gets validated

```
tests/ingestion/
├── url-crawler.test.ts   # local http.createServer fixture
├── path-crawler.test.ts  # temp-directory fixtures
├── git-crawler.test.ts   # real local git repo fixture
├── chunker.test.ts       # chunking behavior
└── fixtures/sample.pdf   # small real PDF
```

## Run it

```bash
npm test
```

## Expected outcome

All tests pass, specifically covering:

- **SC-001** — crawling a small local HTTP fixture site returns a
  `CrawledDocument` for every page within the starting origin/path
  prefix, and none from a deliberately off-scope fixture page.
- **SC-002** — a fixture site sized to exceed a small configured
  `maxDepth`/`maxPageCount` still returns a non-empty, non-erroring
  `CrawlResult` — whatever was fetched before the bound.
- **SC-003** — crawling the same unchanged fixture (file, directory, or
  page) twice produces identical `contentHash` values; changing one
  fixture's content changes only its hash.
- **SC-004** — chunking the same fixture text twice produces identical
  ordinals and text for every chunk.
- **SC-005** — a fixture crawl with one deliberately broken link/unparseable
  file still returns `CrawledDocument`s for everything else.

## Manual smoke test (optional)

To see the crawler work against something real rather than fixtures:

```bash
npm run build
node -e "
import('./dist/ingestion/crawler.js').then(async ({ DefaultCrawler }) => {
  const result = await new DefaultCrawler().crawl({ type: 'path', origin: '.', sourceId: 'smoke-test' });
  console.log(result.error, result.documents.length);
});
"
```

This walks the repo itself for `.md`/`.txt`/`.pdf` files (including
`node_modules/` — nothing in this milestone excludes it) — a quick sanity
check, not a substitute for the test suite above. Requires a build first
since Node can't resolve `.ts` sources via `.js`-suffixed relative
imports without a compile step.

## Type-checking

```bash
npx tsc --noEmit
```

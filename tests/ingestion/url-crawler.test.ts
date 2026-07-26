import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DefaultCrawler } from '../../src/ingestion/crawler.js';

const PAGES: Record<string, { status?: number; html: string }> = {
  '/docs/': {
    html: `<html><body><h1>Docs Home</h1>
      <a href="/docs/page-a">Page A</a>
      <a href="/docs/page-b">Page B</a>
      <a href="/other/page">Other (different prefix)</a>
      <a href="http://example.invalid/external">External (different origin)</a>
      <a href="/docs/broken">Broken</a>
      <a href="http://[::1">Malformed href</a>
    </body></html>`,
  },
  '/docs/page-a': { html: `<html><body><h1>Page A</h1><p>Content A</p></body></html>` },
  '/docs/page-b': {
    html: `<html><body><h1>Page B</h1><a href="/docs/page-c">Page C</a></body></html>`,
  },
  '/docs/page-c': { html: `<html><body><h1>Page C</h1><p>Content C</p></body></html>` },
  '/docs/broken': { status: 500, html: 'Internal Server Error' },
  '/other/page': { html: `<html><body><h1>Other</h1></body></html>` },
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const page = PAGES[req.url ?? ''];
    if (!page) {
      res.writeHead(404).end('Not Found');
      return;
    }
    res.writeHead(page.status ?? 200, { 'Content-Type': 'text/html' }).end(page.html);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server.close();
});

describe('DefaultCrawler — URL source (User Story 1)', () => {
  it('returns a Document for the starting page and every in-scope reachable page', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'url',
      origin: `${baseUrl}/docs/`,
      sourceId: 'source-1',
    });

    expect(result.error).toBeNull();
    const uris = result.documents.map((d) => d.document.uri).sort();
    expect(uris).toEqual(
      [`${baseUrl}/docs/`, `${baseUrl}/docs/page-a`, `${baseUrl}/docs/page-b`, `${baseUrl}/docs/page-c`].sort(),
    );
  });

  it('never fetches or includes a page outside the starting origin/path prefix', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'url',
      origin: `${baseUrl}/docs/`,
      sourceId: 'source-1',
    });

    const uris = result.documents.map((d) => d.document.uri);
    expect(uris).not.toContain(`${baseUrl}/other/page`);
    expect(uris.some((u) => u.includes('example.invalid'))).toBe(false);
  });

  it('ignores a malformed href instead of throwing', async () => {
    // The home page fixture includes an unparseable href
    // ("http://[::1"); the crawl must still complete normally.
    const result = await new DefaultCrawler().crawl({
      type: 'url',
      origin: `${baseUrl}/docs/`,
      sourceId: 'source-1',
    });

    expect(result.error).toBeNull();
    expect(result.documents.length).toBeGreaterThan(0);
  });

  it('stops at the configured bound and returns Documents already fetched, rather than failing (SC-002)', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'url',
      origin: `${baseUrl}/docs/`,
      sourceId: 'source-1',
      bounds: { maxDepth: 1, maxPageCount: 200 },
    });

    expect(result.error).toBeNull();
    const uris = result.documents.map((d) => d.document.uri);
    // page-c is at depth 2, beyond maxDepth: 1 — must be excluded, and the
    // crawl must still succeed rather than error out.
    expect(uris).not.toContain(`${baseUrl}/docs/page-c`);
    expect(result.documents.length).toBeGreaterThan(0);
  });

  it('stops at maxPageCount when it is reached before maxDepth (both bounds configured)', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'url',
      origin: `${baseUrl}/docs/`,
      sourceId: 'source-1',
      bounds: { maxDepth: 200, maxPageCount: 1 },
    });

    expect(result.error).toBeNull();
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].document.uri).toBe(`${baseUrl}/docs/`);
  });

  it('reports a clear error for an origin that is not a parseable URL at all', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'url',
      origin: 'not a url',
      sourceId: 'source-1',
    });

    expect(result.documents).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it('returns an error and zero Documents when the starting URL itself cannot be fetched (FR-008)', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'url',
      origin: `${baseUrl}/does-not-exist`,
      sourceId: 'source-1',
    });

    expect(result.documents).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it('skips a single broken link and still returns Documents for everything else that succeeded (SC-005)', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'url',
      origin: `${baseUrl}/docs/`,
      sourceId: 'source-1',
    });

    // /docs/broken (500) is linked from the home page but must not appear,
    // and must not prevent the rest of the site from being returned.
    const uris = result.documents.map((d) => d.document.uri);
    expect(uris).not.toContain(`${baseUrl}/docs/broken`);
    expect(uris).toContain(`${baseUrl}/docs/page-a`);
    expect(uris).toContain(`${baseUrl}/docs/page-b`);
  });
});

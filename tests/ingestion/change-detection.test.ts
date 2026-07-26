import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DefaultCrawler } from '../../src/ingestion/crawler.js';

// No new production code here — this confirms FR-013's property (stable
// fingerprint when unchanged, different when changed) already falls out
// of hash.ts as exercised by US1-US3's crawl implementations.

function hashesByUri(result: Awaited<ReturnType<DefaultCrawler['crawl']>>) {
  return Object.fromEntries(result.documents.map((d) => [d.document.uri, d.document.contentHash]));
}

describe('Change detection across refreshes (User Story 5)', () => {
  describe('url source', () => {
    let server: Server;
    let baseUrl: string;
    let homeHtml = '<html><body><h1>Home</h1><p>Original content.</p></body></html>';

    beforeAll(async () => {
      server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(homeHtml);
      });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
    });

    afterAll(() => server.close());

    it('produces identical fingerprints across two unchanged crawls, and a different one after a change', async () => {
      const crawler = new DefaultCrawler();
      const first = await crawler.crawl({ type: 'url', origin: `${baseUrl}/`, sourceId: 's1' });
      const second = await crawler.crawl({ type: 'url', origin: `${baseUrl}/`, sourceId: 's1' });
      expect(hashesByUri(second)).toEqual(hashesByUri(first));

      homeHtml = '<html><body><h1>Home</h1><p>Changed content.</p></body></html>';
      const third = await crawler.crawl({ type: 'url', origin: `${baseUrl}/`, sourceId: 's1' });
      expect(hashesByUri(third)[`${baseUrl}/`]).not.toBe(hashesByUri(first)[`${baseUrl}/`]);
    });
  });

  describe('path source', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'tome-change-detection-path-'));
      await writeFile(join(dir, 'a.md'), '# A\n\nOriginal.');
      await writeFile(join(dir, 'b.md'), '# B\n\nUnrelated, never changes.');
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('changes only the modified file\'s fingerprint on refresh', async () => {
      const crawler = new DefaultCrawler();
      const first = await crawler.crawl({ type: 'path', origin: dir, sourceId: 's1' });

      await writeFile(join(dir, 'a.md'), '# A\n\nModified.');
      const second = await crawler.crawl({ type: 'path', origin: dir, sourceId: 's1' });

      const firstHashes = hashesByUri(first);
      const secondHashes = hashesByUri(second);
      expect(secondHashes[join(dir, 'a.md')]).not.toBe(firstHashes[join(dir, 'a.md')]);
      expect(secondHashes[join(dir, 'b.md')]).toBe(firstHashes[join(dir, 'b.md')]);
    });
  });

  describe('git source', () => {
    let repoDir: string;

    beforeEach(async () => {
      repoDir = await mkdtemp(join(tmpdir(), 'tome-change-detection-git-'));
      const git = simpleGit(repoDir);
      await git.init();
      await git.addConfig('user.email', 'test@example.com');
      await git.addConfig('user.name', 'Tome Test');
      await writeFile(join(repoDir, 'a.md'), '# A\n\nOriginal.');
      await git.add('.');
      await git.commit('initial');
    });

    afterEach(async () => {
      await rm(repoDir, { recursive: true, force: true });
    });

    it('produces identical fingerprints across two unchanged crawls of an existing local clone', async () => {
      const crawler = new DefaultCrawler();
      const first = await crawler.crawl({ type: 'git', origin: repoDir, sourceId: 's1' });
      const second = await crawler.crawl({ type: 'git', origin: repoDir, sourceId: 's1' });
      expect(hashesByUri(second)).toEqual(hashesByUri(first));
    });
  });
});

import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefaultCrawler } from '../../src/ingestion/crawler.js';

let repoDir: string;

beforeEach(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'tome-git-source-'));
  const git = simpleGit(repoDir);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Tome Test');
  await writeFile(join(repoDir, 'README.md'), '# Repo\n\nDocs live here.');
  await writeFile(join(repoDir, 'notes.txt'), 'Some notes.');
  await writeFile(join(repoDir, 'corrupt.pdf'), 'not a real pdf');
  await git.add('.');
  await git.commit('initial commit');
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe('DefaultCrawler — git source (User Story 3)', () => {
  it('uses an existing local clone directly, without cloning again', async () => {
    const result = await new DefaultCrawler().crawl({ type: 'git', origin: repoDir, sourceId: 'source-1' });

    expect(result.error).toBeNull();
    const uris = result.documents.map((d) => d.document.uri);
    expect(uris).toContain(join(repoDir, 'README.md'));
    expect(uris).toContain(join(repoDir, 'notes.txt'));
  });

  it('clones a URL-shaped origin fresh and returns the same Documents an existing clone would', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'git',
      origin: `file://${repoDir}`,
      sourceId: 'source-1',
    });

    expect(result.error).toBeNull();
    const basenames = result.documents.map((d) => d.document.uri.split('/').pop()).sort();
    expect(basenames).toEqual(['README.md', 'notes.txt'].sort());
  });

  it('produces zero Documents without an error for a repo containing no matching files', async () => {
    const emptyRepoDir = await mkdtemp(join(tmpdir(), 'tome-git-empty-'));
    const git = simpleGit(emptyRepoDir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Tome Test');
    await writeFile(join(emptyRepoDir, 'image.png'), 'not markdown');
    await git.add('.');
    await git.commit('initial');

    try {
      const result = await new DefaultCrawler().crawl({ type: 'git', origin: emptyRepoDir, sourceId: 'source-1' });
      expect(result.documents).toEqual([]);
      expect(result.error).toBeNull();
    } finally {
      await rm(emptyRepoDir, { recursive: true, force: true });
    }
  });

  it('reports a clear error and produces zero Documents for an unclonable origin (FR-008)', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'git',
      origin: `file://${repoDir}-does-not-exist`,
      sourceId: 'source-1',
    });

    expect(result.documents).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it('reports a clear error instead of hanging when the remote never responds (e.g. stalled on credentials)', async () => {
    const stallingServer = createServer((_req, _res) => {
      // Accepts the connection but intentionally never responds —
      // simulates a remote silently waiting on a credential prompt
      // rather than failing fast.
    });
    await new Promise<void>((resolve) => stallingServer.listen(0, resolve));
    const { port } = (stallingServer.address() as { port: number }) ?? { port: 0 };

    try {
      const result = await new DefaultCrawler().crawl({
        type: 'git',
        origin: `http://localhost:${port}/repo.git`,
        sourceId: 'source-1',
        bounds: { requestTimeoutMs: 300 },
      });

      expect(result.documents).toEqual([]);
      expect(result.error).not.toBeNull();
    } finally {
      stallingServer.close();
    }
  });

  it('reports a clear error when a plain-path origin (no clone attempted) does not exist', async () => {
    // Not URL-shaped, so no clone is attempted — this exercises the
    // "read an existing working tree" failure path specifically, as
    // opposed to the "clone failed" path above.
    const result = await new DefaultCrawler().crawl({
      type: 'git',
      origin: `${repoDir}-does-not-exist`,
      sourceId: 'source-1',
    });

    expect(result.documents).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it('skips a single corrupt file in the working tree and still returns the rest (SC-005)', async () => {
    const result = await new DefaultCrawler().crawl({ type: 'git', origin: repoDir, sourceId: 'source-1' });

    const uris = result.documents.map((d) => d.document.uri);
    expect(uris).not.toContain(join(repoDir, 'corrupt.pdf'));
    expect(uris).toContain(join(repoDir, 'README.md'));
  });
});

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefaultCrawler } from '../../src/ingestion/crawler.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tome-path-crawler-'));
  await writeFile(join(dir, 'readme.md'), '# Guide\n\nSome content.');
  await writeFile(join(dir, 'notes.txt'), 'Some notes');
  await writeFile(join(dir, 'image.png'), 'fake png data');
  await writeFile(join(dir, 'data.json'), '{}');
  await writeFile(join(dir, 'corrupt.pdf'), 'this is not a valid pdf');
  const samplePdf = await readFile(
    join(import.meta.dirname, 'fixtures', 'sample.pdf'),
  );
  await writeFile(join(dir, 'manual.pdf'), samplePdf);
  await mkdir(join(dir, 'sub'));
  await writeFile(join(dir, 'sub', 'nested.md'), '# Nested\n\nNested content.');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('DefaultCrawler — local path source (User Story 2)', () => {
  it('returns one Document per matching file, including subdirectories', async () => {
    const result = await new DefaultCrawler().crawl({ type: 'path', origin: dir, sourceId: 'source-1' });

    expect(result.error).toBeNull();
    const uris = result.documents.map((d) => d.document.uri);
    expect(uris).toContain(join(dir, 'readme.md'));
    expect(uris).toContain(join(dir, 'notes.txt'));
    expect(uris).toContain(join(dir, 'manual.pdf'));
    expect(uris).toContain(join(dir, 'sub', 'nested.md'));
  });

  it('excludes files of non-matching types', async () => {
    const result = await new DefaultCrawler().crawl({ type: 'path', origin: dir, sourceId: 'source-1' });

    const uris = result.documents.map((d) => d.document.uri);
    expect(uris).not.toContain(join(dir, 'image.png'));
    expect(uris).not.toContain(join(dir, 'data.json'));
  });

  it('produces zero Documents without an error for a valid path containing no matching files', async () => {
    const emptyDir = join(dir, 'empty');
    await mkdir(emptyDir);

    const result = await new DefaultCrawler().crawl({ type: 'path', origin: emptyDir, sourceId: 'source-1' });

    expect(result.documents).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('reports a clear error and produces zero Documents for a path that does not exist (FR-008)', async () => {
    const result = await new DefaultCrawler().crawl({
      type: 'path',
      origin: join(dir, 'does-not-exist'),
      sourceId: 'source-1',
    });

    expect(result.documents).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it('skips a single corrupt file and still returns Documents for everything else (SC-005)', async () => {
    const result = await new DefaultCrawler().crawl({ type: 'path', origin: dir, sourceId: 'source-1' });

    const uris = result.documents.map((d) => d.document.uri);
    expect(uris).not.toContain(join(dir, 'corrupt.pdf'));
    expect(uris).toContain(join(dir, 'readme.md'));
    expect(uris).toContain(join(dir, 'manual.pdf'));
  });
});

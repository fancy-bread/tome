// Contract for turning a Source into raw, text-bearing Documents.
// See specs/002-ingestion-pipeline/spec.md FR-001 through FR-008, FR-012,
// FR-013, and data-model.md for field-level rationale.
//
// Must not import from src/storage/ or any embedding module (Constitution
// Principle IV) — a Crawler is usable standalone, as proven by
// tests/ingestion/*.test.ts running it with no DocumentIndex or Embedder
// present.

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { simpleGit } from 'simple-git';
import TurndownService from 'turndown';
import type { Document, SourceType } from '../core/types.js';
import { contentHash } from './hash.js';
import { extractTitle } from './title.js';
import { walkDirectory } from './walk-directory.js';

export interface CrawlBounds {
  /** Default 3. Depth 0 is the starting page; each hop adds 1. Url only. */
  maxDepth: number;
  /** Default 200. Total documents fetched across the whole crawl. Url only. */
  maxPageCount: number;
  /**
   * Default 30_000. Caps a single network operation — one page fetch
   * (url) or the whole clone (git) — so an unresponsive host or a git
   * remote silently waiting on credential input degrades to a
   * source-level error instead of leaving the source stuck in
   * `indexing` forever (Constitution Principle II). Not consulted for
   * `path`, which never does network I/O.
   */
  requestTimeoutMs: number;
}

export interface CrawlInput {
  type: SourceType;
  origin: string;
  /**
   * The Source this crawl is for — stamped onto every Document produced.
   * The caller creates the Source (e.g. via DocumentIndex.addSource)
   * before crawling and passes its id here.
   */
  sourceId: string;
  /**
   * maxDepth/maxPageCount are consulted only when type === 'url';
   * requestTimeoutMs is consulted for 'url' and 'git' (both do network
   * I/O); nothing here is consulted for 'path'.
   */
  bounds?: Partial<CrawlBounds>;
}

export interface CrawledDocument {
  document: Document;
  /**
   * Raw extracted text, handed to the Chunker. Never persisted itself —
   * Document (per milestone 001) has no text field; Chunks are the only
   * durable text-bearing unit.
   */
  text: string;
}

export interface CrawlResult {
  /** Everything successfully fetched/parsed, including partial results
   * from a bounded or partially-failed crawl (FR-003, FR-007). */
  documents: CrawledDocument[];
  /**
   * Set only for a source-level failure (unreachable start URL,
   * unclonable repo, invalid local path — FR-008); null on full or
   * partial success. error !== null implies documents is empty.
   */
  error: string | null;
}

export interface Crawler {
  crawl(input: CrawlInput): Promise<CrawlResult>;
}

const DEFAULT_BOUNDS: CrawlBounds = { maxDepth: 3, maxPageCount: 200, requestTimeoutMs: 30_000 };

// atx (`#`/`##`/...) rather than Turndown's default setext style, so an
// <h1>/<h2> converts to a line extractTitle's ATX-only regex can match —
// see the title-extraction regression test in tests/ingestion/url-crawler.test.ts.
const turndownService = new TurndownService({ headingStyle: 'atx' });
// Turndown's script/style removal is opt-in — without this, a hydration
// payload embedded in a <script> tag (e.g. Next.js's self.__next_f.push
// blobs) gets converted to text as one unbroken block, which the chunker
// then can't split, producing a single oversized chunk per page.
turndownService.remove(['script', 'style']);

interface QueueItem {
  url: URL;
  depth: number;
}

export class DefaultCrawler implements Crawler {
  async crawl(input: CrawlInput): Promise<CrawlResult> {
    const bounds = { ...DEFAULT_BOUNDS, ...input.bounds };
    switch (input.type) {
      case 'url':
        return this.crawlUrl(input.origin, input.sourceId, bounds);
      case 'path':
        return this.crawlPath(input.origin, input.sourceId);
      case 'git':
        return this.crawlGit(input.origin, input.sourceId, bounds.requestTimeoutMs);
    }
  }

  private async crawlUrl(origin: string, sourceId: string, bounds: CrawlBounds): Promise<CrawlResult> {
    let startUrl: URL;
    try {
      startUrl = new URL(origin);
    } catch {
      return { documents: [], error: `Invalid URL: ${origin}` };
    }

    const lastSlash = startUrl.pathname.lastIndexOf('/');
    const pathPrefix = lastSlash >= 0 ? startUrl.pathname.slice(0, lastSlash + 1) : '/';
    const inScope = (url: URL) => url.origin === startUrl.origin && url.pathname.startsWith(pathPrefix);

    const visited = new Set<string>([startUrl.href]);
    const queue: QueueItem[] = [{ url: startUrl, depth: 0 }];
    const documents: CrawledDocument[] = [];

    while (queue.length > 0 && documents.length < bounds.maxPageCount) {
      const item = queue.shift();
      if (!item) break;
      const { url, depth } = item;

      let html: string;
      try {
        const response = await fetch(url.href, { signal: AbortSignal.timeout(bounds.requestTimeoutMs) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        html = await response.text();
      } catch (err) {
        if (documents.length === 0) {
          // This is always the starting page (it's seeded first in the
          // queue) — a source-level failure (FR-008), not a per-page one.
          const message = err instanceof Error ? err.message : String(err);
          return { documents: [], error: `Unable to fetch starting URL: ${origin} (${message})` };
        }
        continue; // skip this page, keep going (FR-007)
      }

      const $ = cheerio.load(html);
      const text = turndownService.turndown(html);

      documents.push({
        document: {
          id: randomUUID(),
          sourceId,
          uri: url.href,
          title: extractTitle(text),
          contentHash: contentHash(text),
          fetchedAt: Date.now(),
        },
        text,
      });

      if (depth < bounds.maxDepth) {
        $('a[href]').each((_i, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          let linked: URL;
          try {
            linked = new URL(href, url);
          } catch {
            return;
          }
          linked.hash = '';
          if (inScope(linked) && !visited.has(linked.href)) {
            visited.add(linked.href);
            queue.push({ url: linked, depth: depth + 1 });
          }
        });
      }
    }

    return { documents, error: null };
  }

  private async crawlPath(origin: string, sourceId: string): Promise<CrawlResult> {
    try {
      const documents = await this.crawlDirectoryTree(origin, sourceId);
      return { documents, error: null };
    } catch (err) {
      // Invalid/unreadable path is a source-level failure (FR-008),
      // the same category as an unreachable URL or unclonable repo —
      // named explicitly in Constitution Principle II.
      const message = err instanceof Error ? err.message : String(err);
      return { documents: [], error: `Unable to read path: ${origin} (${message})` };
    }
  }

  private async crawlGit(origin: string, sourceId: string, requestTimeoutMs: number): Promise<CrawlResult> {
    let workingTree = origin;
    let tempDir: string | null = null;

    // A URL-shaped origin (scheme://, including file://, or an scp-like
    // git@host:path form) is something to clone; anything else is treated
    // as an existing local working tree and used directly (FR-005).
    if (this.isCloneableGitUrl(origin)) {
      try {
        tempDir = await mkdtemp(join(tmpdir(), 'tome-git-clone-'));
        // `block` kills the git child process if it goes this long with no
        // stdout/stderr output — the case that matters most is an SSH
        // remote silently waiting on a credential prompt, which otherwise
        // hangs forever rather than failing (Constitution Principle II).
        await simpleGit({ timeout: { block: requestTimeoutMs } }).clone(origin, tempDir);
        workingTree = tempDir;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { documents: [], error: `Unable to clone git repository: ${origin} (${message})` };
      }
    }

    try {
      // Reuses the same file-reading logic as a local path source (FR-005).
      const documents = await this.crawlDirectoryTree(workingTree, sourceId);
      return { documents, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { documents: [], error: `Unable to read git working tree: ${origin} (${message})` };
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  }

  private isCloneableGitUrl(origin: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(origin) || /^[\w.-]+@[\w.-]+:/.test(origin);
  }

  /**
   * Shared by crawlPath and crawlGit — walks a directory tree and reads
   * each matching file. Throws if the root itself is invalid/unreadable;
   * callers turn that into a source-level CrawlResult.error.
   */
  private async crawlDirectoryTree(rootPath: string, sourceId: string): Promise<CrawledDocument[]> {
    const filePaths = await walkDirectory(rootPath);
    const documents: CrawledDocument[] = [];
    for (const filePath of filePaths) {
      try {
        const text = await this.readFileAsText(filePath);
        documents.push({
          document: {
            id: randomUUID(),
            sourceId,
            uri: filePath,
            title: extractTitle(text),
            contentHash: contentHash(text),
            fetchedAt: Date.now(),
          },
          text,
        });
      } catch {
        continue; // skip a single file that fails to read/parse (FR-007)
      }
    }
    return documents;
  }

  /** Reads .md/.txt as UTF-8, extracts .pdf via pdf-parse. */
  private async readFileAsText(filePath: string): Promise<string> {
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const buffer = await readFile(filePath);
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return result.text.replace(/\n*-- \d+ of \d+ --\n*/g, '\n').trim();
      } finally {
        await parser.destroy();
      }
    }
    return readFile(filePath, 'utf8');
  }
}

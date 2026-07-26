import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const MATCHING_EXTENSIONS = new Set(['.md', '.txt', '.pdf']);

/**
 * Recursively walks `rootPath` and returns absolute paths of every file
 * matching .md/.txt/.pdf, including subdirectories (FR-004). Shared by
 * path crawling and git crawling (FR-005) so "the same file types as a
 * local path source" is provably true rather than duplicated.
 *
 * Throws if `rootPath` doesn't exist or can't be read — callers
 * (crawler.ts) are responsible for catching that and surfacing it as a
 * source-level CrawlResult.error (FR-008), per Constitution Principle II.
 */
export async function walkDirectory(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { recursive: true, withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!MATCHING_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    matches.push(join(entry.parentPath, entry.name));
  }
  return matches;
}

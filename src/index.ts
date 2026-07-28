#!/usr/bin/env node
// The daemon entry point — the first thing in this project that's
// actually runnable as a standalone process. See
// specs/004-mcp-server/spec.md's Assumptions section and research.md
// for why the db path resolves the way it does and why the no-op
// Embedder lives here rather than in a new src/embedding/ module.

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OllamaEmbedder } from './embedding/ollama-embedder.js';
import { createTomeServer } from './mcp/server.js';
import { SqliteDocumentIndex } from './storage/sqlite-document-index.js';

const DEFAULT_DATA_DIR = join(homedir(), '.claude', 'plugins', 'tome');

/**
 * Resolves the SQLite file path: `CLAUDE_PLUGIN_DATA/index.db` when the
 * plugin harness has set that variable (milestone 007's `.mcp.json`
 * forwards it), else a fixed default so this daemon is runnable
 * standalone without the harness (per spec.md's Assumptions).
 */
export function resolveDbPath(env: NodeJS.ProcessEnv): string {
  const dataDir = env.CLAUDE_PLUGIN_DATA ?? DEFAULT_DATA_DIR;
  return join(dataDir, 'index.db');
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath(process.env);
  await mkdir(dirname(dbPath), { recursive: true });

  const index = new SqliteDocumentIndex({ dbPath, embedder: new OllamaEmbedder() });
  const server = createTomeServer(index);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run when this file is the actual entry point — not when imported
// (e.g. to test resolveDbPath) by another module.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

#!/usr/bin/env node
// The daemon entry point — the first thing in this project that's
// actually runnable as a standalone process. See
// specs/004-mcp-server/spec.md's Assumptions section and research.md
// for why the db path resolves the way it does and why the no-op
// Embedder lives here rather than in a new src/embedding/ module.

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
 *
 * Some hosts (observed: the VS Code extension) launch the MCP server
 * without expanding `.mcp.json`'s `${CLAUDE_PLUGIN_DATA}` placeholder,
 * so the env var arrives as that literal template string rather than
 * being unset. Treat it the same as unset rather than mkdir'ing a
 * `${CLAUDE_PLUGIN_DATA}` directory into whatever the cwd happens to be.
 */
export function resolveDbPath(env: NodeJS.ProcessEnv): string {
  const dataDir =
    env.CLAUDE_PLUGIN_DATA && env.CLAUDE_PLUGIN_DATA !== '${CLAUDE_PLUGIN_DATA}'
      ? env.CLAUDE_PLUGIN_DATA
      : DEFAULT_DATA_DIR;
  return join(dataDir, 'index.db');
}

/**
 * Builds the real, fully-wired server: resolves the db path, ensures
 * its directory exists, and constructs a real `SqliteDocumentIndex` and
 * `OllamaEmbedder` — everything short of binding a transport. Separated
 * from `main` so this real wiring is directly testable (via an
 * in-memory transport) without also having to bind `process.stdin`/
 * `stdout` inside the test process.
 */
export async function buildServer(env: NodeJS.ProcessEnv): Promise<McpServer> {
  const dbPath = resolveDbPath(env);
  await mkdir(dirname(dbPath), { recursive: true });

  const index = new SqliteDocumentIndex({ dbPath, embedder: new OllamaEmbedder() });
  return createTomeServer(index);
}

/** Logs and exits — the daemon's top-level fatal-error handler. */
export function handleFatalError(err: unknown): void {
  console.error(err);
  process.exit(1);
}

async function main(): Promise<void> {
  const server = await buildServer(process.env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run when this file is the actual entry point — not when imported
// (e.g. to test resolveDbPath/buildServer) by another module.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(handleFatalError);
}

// Builds the MCP server exposing DocumentIndex over the four tome_*
// tools. See specs/004-mcp-server/spec.md and data-model.md.
//
// Takes DocumentIndex (the interface), never a concrete implementation
// (Constitution Principle IV) — this is what lets tests substitute
// InMemoryDocumentIndex for speed while production wires in a real
// SqliteDocumentIndex (src/index.ts).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DocumentIndex } from '../core/document-index.js';
import {
  TOME_ADD_SOURCE,
  TOME_FETCH,
  TOME_LIST_SOURCES,
  TOME_SEARCH,
} from './tool-descriptions.js';

function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/**
 * Wraps a tool handler so any thrown error — NotFoundError, a missing
 * dependency, anything unexpected — becomes a structured `isError: true`
 * result instead of an uncaught exception over the transport (FR-008).
 * No tool handler in this file skips this wrapper.
 */
function withErrorHandling<Args>(
  handler: (args: Args) => Promise<CallToolResult>,
): (args: Args) => Promise<CallToolResult> {
  return async (args: Args) => {
    try {
      return await handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  };
}

export function createTomeServer(index: DocumentIndex): McpServer {
  const server = new McpServer({ name: 'tome', version: '0.1.0' });

  server.registerTool(
    TOME_ADD_SOURCE.name,
    { description: TOME_ADD_SOURCE.description, inputSchema: TOME_ADD_SOURCE.inputSchema },
    withErrorHandling(async ({ type, origin }: { type: 'url' | 'path' | 'git'; origin: string }) => {
      const source = await index.addSource({ type, origin });
      return jsonResult({ sourceId: source.id, status: source.status });
    }),
  );

  server.registerTool(
    TOME_SEARCH.name,
    { description: TOME_SEARCH.description, inputSchema: TOME_SEARCH.inputSchema },
    withErrorHandling(async ({ query, limit, sourceId }: { query: string; limit?: number; sourceId?: string }) => {
      const ranked = await index.search(query, { limit, sourceId });
      return jsonResult({
        results: ranked.map((r) => ({
          chunkId: r.chunk.id,
          text: r.chunk.text,
          sourceId: r.source.id,
          uri: r.document.uri,
          title: r.document.title,
          score: r.score,
          rankedBy: r.rankedBy,
        })),
      });
    }),
  );

  server.registerTool(
    TOME_FETCH.name,
    { description: TOME_FETCH.description, inputSchema: TOME_FETCH.inputSchema },
    withErrorHandling(async ({ id }: { id: string }) => {
      const result = await index.fetch(id);
      if ('documentId' in result) {
        return jsonResult({
          id: result.id,
          type: 'chunk',
          text: result.text,
          documentId: result.documentId,
          ordinal: result.ordinal,
        });
      }
      return jsonResult({
        id: result.id,
        type: 'document',
        uri: result.uri,
        title: result.title,
        sourceId: result.sourceId,
      });
    }),
  );

  server.registerTool(
    TOME_LIST_SOURCES.name,
    { description: TOME_LIST_SOURCES.description, inputSchema: TOME_LIST_SOURCES.inputSchema },
    withErrorHandling(async () => {
      const sources = await index.listSources();
      return jsonResult({
        sources: sources.map((s) => ({
          id: s.id,
          type: s.type,
          origin: s.origin,
          status: s.status,
          lastIndexedAt: s.lastIndexedAt,
          error: s.error,
        })),
      });
    }),
  );

  return server;
}

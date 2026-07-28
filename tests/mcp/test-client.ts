import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { DocumentIndex } from '../../src/core/document-index.js';
import { createTomeServer } from '../../src/mcp/server.js';

/**
 * Builds a server from `createTomeServer` and connects a real MCP
 * client to it over an in-memory linked transport pair — a real client
 * and a real server exchanging real protocol messages, just without a
 * child process or the stdio transport specifically (that's what
 * tests/mcp/stdio.test.ts proves separately).
 */
export async function connectTestClient(index: DocumentIndex): Promise<Client> {
  const server = createTomeServer(index);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'tome-test-client', version: '0.0.1' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

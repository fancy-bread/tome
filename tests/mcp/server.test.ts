import { describe, expect, it } from 'vitest';
import type { DocumentIndex } from '../../src/core/document-index.js';
import { InMemoryDocumentIndex } from '../contract/in-memory-document-index.js';
import { TOME_FETCH, TOME_REMOVE_SOURCE, TOME_SEARCH } from '../../src/mcp/tool-descriptions.js';
import { connectTestClient } from './test-client.js';

/** Delegates everything to a real InMemoryDocumentIndex except search(),
 * which throws a plain Error — proving FR-008's isError wrapping isn't
 * special-cased to NotFoundError. */
class ThrowingSearchIndex implements DocumentIndex {
  private delegate = new InMemoryDocumentIndex();
  addSource: DocumentIndex['addSource'] = (input) => this.delegate.addSource(input);
  fetch: DocumentIndex['fetch'] = (id) => this.delegate.fetch(id);
  listSources: DocumentIndex['listSources'] = () => this.delegate.listSources();
  removeSource: DocumentIndex['removeSource'] = (id) => this.delegate.removeSource(id);
  async search(): Promise<never> {
    throw new Error('search backend unavailable');
  }
}

describe('MCP server — User Story 1: Start the Daemon and Discover Its Tools', () => {
  it('advertises all five tools with names, descriptions, and input schemas', async () => {
    const client = await connectTestClient(new InMemoryDocumentIndex());
    const tools = await client.listTools();

    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ['tome_add_source', 'tome_fetch', 'tome_list_sources', 'tome_remove_source', 'tome_search'].sort(),
    );

    for (const tool of tools.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('remains available and responsive to a later request with no tool calls in between', async () => {
    const client = await connectTestClient(new InMemoryDocumentIndex());
    const first = await client.listTools();
    const second = await client.listTools();
    expect(second.tools.length).toBe(first.tools.length);
  });
});

describe('MCP server — User Story 2: Add a Source via MCP', () => {
  it('returns an identifier and pending/indexing status for a valid source', async () => {
    const client = await connectTestClient(new InMemoryDocumentIndex());
    const result = await client.callTool({
      name: 'tome_add_source',
      arguments: { type: 'url', origin: 'https://example.com/docs' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: 'text'; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.sourceId).toBeTruthy();
    expect(['pending', 'indexing']).toContain(parsed.status);
  });

  it('reflects a refresh, not a new source, when the origin already exists', async () => {
    const client = await connectTestClient(new InMemoryDocumentIndex());
    const first = await client.callTool({
      name: 'tome_add_source',
      arguments: { type: 'url', origin: 'https://example.com/docs' },
    });
    const second = await client.callTool({
      name: 'tome_add_source',
      arguments: { type: 'url', origin: 'https://example.com/docs' },
    });

    const firstId = JSON.parse((first.content as Array<{ type: 'text'; text: string }>)[0].text).sourceId;
    const secondId = JSON.parse((second.content as Array<{ type: 'text'; text: string }>)[0].text).sourceId;
    expect(secondId).toBe(firstId);
  });

  it('returns isError: true for a call missing a required argument, confirming the SDK auto-validates (research.md)', async () => {
    const client = await connectTestClient(new InMemoryDocumentIndex());
    const result = await client.callTool({
      name: 'tome_add_source',
      arguments: { type: 'url' } as unknown as Record<string, unknown>,
    });
    expect(result.isError).toBe(true);
  });
});

describe('MCP server — User Story 3: Search Indexed Documentation via MCP', () => {
  it('returns ranked results shaped per data-model.md for a matching query', async () => {
    const seedIndex = new InMemoryDocumentIndex();
    const source = seedIndex.seedSource({ id: 'source-1' });
    const document = seedIndex.seedDocument(source.id, {
      uri: 'https://example.com/docs/page',
      title: 'Page Title',
    });
    seedIndex.seedChunk(document.id, { text: 'widgets are great', embedding: null });

    const client = await connectTestClient(seedIndex);
    const result = await client.callTool({
      name: 'tome_search',
      arguments: { query: 'widgets' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: 'text'; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({
      text: 'widgets are great',
      sourceId: source.id,
      uri: 'https://example.com/docs/page',
      title: 'Page Title',
      rankedBy: 'lexical',
    });
    expect(typeof parsed.results[0].chunkId).toBe('string');
    expect(typeof parsed.results[0].score).toBe('number');
  });

  it('returns an empty array, not an error, when nothing matches', async () => {
    const client = await connectTestClient(new InMemoryDocumentIndex());
    const result = await client.callTool({
      name: 'tome_search',
      arguments: { query: 'nothing indexed matches this' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: 'text'; text: string }>)[0].text;
    expect(JSON.parse(text).results).toEqual([]);
  });

  it('describes tome_search as something to call proactively, without waiting for an explicit ask (Constitution Principle III)', () => {
    expect(TOME_SEARCH.description).toMatch(/proactively/i);
  });
});

describe('MCP server — User Story 4: Fetch Full Content via MCP', () => {
  it('returns the full chunk for a known chunk id', async () => {
    const seedIndex = new InMemoryDocumentIndex();
    const source = seedIndex.seedSource({ id: 'source-1' });
    const document = seedIndex.seedDocument(source.id, { uri: '/doc', title: 'Doc Title' });
    const chunk = seedIndex.seedChunk(document.id, { text: 'full chunk text', ordinal: 2 });

    const client = await connectTestClient(seedIndex);
    const result = await client.callTool({ name: 'tome_fetch', arguments: { id: chunk.id } });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ type: 'text'; text: string }>)[0].text);
    expect(parsed).toMatchObject({
      id: chunk.id,
      type: 'chunk',
      text: 'full chunk text',
      documentId: document.id,
      ordinal: 2,
    });
  });

  it('returns the full document for a known document id', async () => {
    const seedIndex = new InMemoryDocumentIndex();
    const source = seedIndex.seedSource({ id: 'source-1' });
    const document = seedIndex.seedDocument(source.id, { uri: '/doc', title: 'Doc Title' });

    const client = await connectTestClient(seedIndex);
    const result = await client.callTool({ name: 'tome_fetch', arguments: { id: document.id } });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ type: 'text'; text: string }>)[0].text);
    expect(parsed).toMatchObject({
      id: document.id,
      type: 'document',
      uri: '/doc',
      title: 'Doc Title',
      sourceId: source.id,
    });
  });

  it('returns isError: true for an unknown id, and the server remains responsive afterward', async () => {
    const client = await connectTestClient(new InMemoryDocumentIndex());
    const result = await client.callTool({ name: 'tome_fetch', arguments: { id: 'does-not-exist' } });
    expect(result.isError).toBe(true);

    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
  });

  it('describes tome_fetch as something to call proactively, without waiting for an explicit ask (Constitution Principle III)', () => {
    expect(TOME_FETCH.description).toMatch(/proactively/i);
  });
});

describe('MCP server — User Story 5: List Sources via MCP', () => {
  it('lists sources in different states, each with its full status fields', async () => {
    const seedIndex = new InMemoryDocumentIndex();
    const ready = seedIndex.seedSource({
      id: 'ready-source',
      origin: 'https://example.com/ready',
      status: 'ready',
      lastIndexedAt: 12345,
    });
    const pending = seedIndex.seedSource({
      id: 'pending-source',
      origin: 'https://example.com/pending',
      status: 'pending',
    });
    const errored = seedIndex.seedSource({
      id: 'error-source',
      origin: 'https://example.com/broken',
      status: 'error',
      error: 'fetch failed',
    });

    const client = await connectTestClient(seedIndex);
    const result = await client.callTool({ name: 'tome_list_sources', arguments: {} });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ type: 'text'; text: string }>)[0].text);
    const byId = Object.fromEntries(
      (parsed.sources as Array<{ id: string }>).map((s) => [s.id, s]),
    );

    expect(byId[ready.id]).toMatchObject({ status: 'ready', lastIndexedAt: 12345 });
    expect(byId[pending.id]).toMatchObject({ status: 'pending' });
    expect(byId[errored.id]).toMatchObject({ status: 'error', error: 'fetch failed' });
  });
});

describe('MCP server — User Story: Remove a Source via MCP (Constitution Principle III, inverted)', () => {
  it('describes tome_remove_source as a deliberate action to take only when explicitly asked, not something to call on its own initiative', () => {
    expect(TOME_REMOVE_SOURCE.description).toMatch(/explicitly asked/i);
    expect(TOME_REMOVE_SOURCE.description).toMatch(/never.*own initiative|not.*own initiative/i);
  });

  it('returns isError: true for an unknown source id, and the server remains responsive afterward', async () => {
    const client = await connectTestClient(new InMemoryDocumentIndex());
    const result = await client.callTool({ name: 'tome_remove_source', arguments: { id: 'does-not-exist' } });
    expect(result.isError).toBe(true);

    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
  });
});

describe('MCP server — Cross-Cutting: Error Isolation (FR-008)', () => {
  it('turns an unexpected, non-NotFoundError thrown by the index into isError: true, and the server stays responsive', async () => {
    const client = await connectTestClient(new ThrowingSearchIndex());

    const result = await client.callTool({ name: 'tome_search', arguments: { query: 'anything' } });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: 'text'; text: string }>)[0].text;
    expect(text).toContain('search backend unavailable');

    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
  });
});

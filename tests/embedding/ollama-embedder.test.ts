import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { OllamaEmbedder } from '../../src/embedding/ollama-embedder.js';

const REAL_EMBEDDING = Array.from({ length: 768 }, (_, i) => i / 768);

let server: Server;
let baseUrl: string;
let nextResponse: { status: number; body: string } = {
  status: 200,
  body: JSON.stringify({ embedding: REAL_EMBEDDING }),
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      res.writeHead(nextResponse.status, { 'Content-Type': 'application/json' }).end(nextResponse.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  nextResponse = { status: 200, body: JSON.stringify({ embedding: REAL_EMBEDDING }) };
});

describe('OllamaEmbedder', () => {
  it('returns the parsed vector for a successful request', async () => {
    const embedder = new OllamaEmbedder({ baseUrl });
    const result = await embedder.embed('some text');
    expect(result).toEqual(REAL_EMBEDDING);
  });

  it('returns null for a non-2xx response', async () => {
    nextResponse = { status: 500, body: 'Internal Server Error' };
    const embedder = new OllamaEmbedder({ baseUrl });
    expect(await embedder.embed('some text')).toBeNull();
  });

  it('returns null for a malformed JSON body', async () => {
    nextResponse = { status: 200, body: 'not json' };
    const embedder = new OllamaEmbedder({ baseUrl });
    expect(await embedder.embed('some text')).toBeNull();
  });

  it('returns null for a body missing the embedding field', async () => {
    nextResponse = { status: 200, body: JSON.stringify({ nope: true }) };
    const embedder = new OllamaEmbedder({ baseUrl });
    expect(await embedder.embed('some text')).toBeNull();
  });

  it('returns null for an embedding of the wrong length', async () => {
    nextResponse = { status: 200, body: JSON.stringify({ embedding: [1, 2, 3] }) };
    const embedder = new OllamaEmbedder({ baseUrl });
    expect(await embedder.embed('some text')).toBeNull();
  });

  it('returns null when the server is unreachable', async () => {
    const unreachable = new OllamaEmbedder({ baseUrl: 'http://localhost:1' });
    expect(await unreachable.embed('some text')).toBeNull();
  });

  it('targets http://localhost:11434 by default (FR-011/SC-004)', async () => {
    // A real server bound to the literal default port would risk
    // colliding with an actual Ollama instance already running on this
    // machine — unlike every other scenario above, this one only needs
    // to prove *which URL* a default-constructed instance targets, so a
    // fetch spy is used instead of a real listener on port 11434.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ embedding: REAL_EMBEDDING }), { status: 200 }),
    );
    try {
      const embedder = new OllamaEmbedder();
      await embedder.embed('some text');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.anything(),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

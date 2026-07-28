// Concrete v1 Embedder implementation. See
// specs/005-local-embedding-reconciliation/spec.md FR-001, FR-002,
// FR-011 and research.md #1-#2 for the HTTP shape and failure-handling
// decisions.

import type { Embedder } from '../core/embedder.js';

export interface OllamaEmbedderOptions {
  /** Not user-facing configuration (Constitution Principle V) — a
   * constructor option purely so tests can point this at a local test
   * server instead of a real Ollama instance. */
  baseUrl?: string;
  model?: string;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768;

export class OllamaEmbedder implements Embedder {
  private baseUrl: string;
  private model: string;

  constructor(options: OllamaEmbedderOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.model = options.model ?? DEFAULT_MODEL;
  }

  /**
   * Returns the embedding for `text`, or `null` for every failure mode —
   * network error, non-2xx response, unparseable body, a body missing
   * `embedding`, or an `embedding` of the wrong length. Never throws
   * (Constitution Principle II).
   */
  async embed(text: string): Promise<number[] | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });
    } catch {
      return null;
    }

    if (!response.ok) return null;

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return null;
    }

    const embedding = (body as { embedding?: unknown }).embedding;
    if (
      !Array.isArray(embedding) ||
      embedding.length !== EMBEDDING_DIMENSIONS ||
      !embedding.every((value) => typeof value === 'number')
    ) {
      return null;
    }

    return embedding;
  }
}

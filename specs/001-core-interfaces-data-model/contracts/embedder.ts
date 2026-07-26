// Contract for turning text into a vector representation.
// See spec.md FR-012 and Constitution Principle II (graceful degradation):
// unavailability is a return value, never a thrown exception.

export interface Embedder {
  /**
   * Returns a vector for the given text, or null if the embedding service
   * is unavailable right now. A null return is an expected, non-error
   * outcome — callers fall back to lexical ranking, they do not retry
   * synchronously or treat it as a failure.
   */
  embed(text: string): Promise<number[] | null>;
}

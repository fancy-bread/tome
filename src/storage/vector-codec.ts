/**
 * Encodes/decodes an embedding for sqlite-vec's vec0 virtual table, which
 * expects a raw float32 buffer, not a JSON array (discovered empirically
 * during implementation — see the equivalent note in research.md for
 * milestone 002's pdf-parse discovery; same category of thing).
 *
 * vec0 columns have a fixed dimension declared at schema creation time
 * (768, matching nomic-embed-text — see schema.ts). Real embeddings are
 * always exactly 768-dimensional, so this is an exact round-trip in
 * production. Milestone 001's reused contract suite uses a synthetic
 * `FakeEmbedder` producing much shorter vectors (e.g. 2 dimensions) for
 * deterministic testing — those are zero-padded to fit the fixed column
 * width. Padding preserves relative distance between vectors (the extra
 * zero dimensions contribute equally to every padded vector), so ranking
 * behavior is unaffected; it does mean `decodeEmbedding` returns a
 * 768-length array for a short test vector, not the original short one —
 * an accepted limitation of a fixed-width production column being reused
 * by a dimension-agnostic test double. No current test round-trips a
 * short embedding through fetch() and checks exact equality.
 */
const EMBEDDING_DIMENSIONS = 768;

export function encodeEmbedding(embedding: number[]): Buffer {
  const padded = new Float32Array(EMBEDDING_DIMENSIONS);
  padded.set(embedding.slice(0, EMBEDDING_DIMENSIONS));
  return Buffer.from(padded.buffer);
}

export function decodeEmbedding(buffer: Buffer): number[] {
  return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
}

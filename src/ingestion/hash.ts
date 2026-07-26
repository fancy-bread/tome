import { createHash } from 'node:crypto';

/**
 * Content fingerprint for a Document — SHA-256 of the raw extracted text,
 * matching tdd.md's field definition. Changes if and only if the text
 * changed since it was last computed (spec.md FR-006, FR-013).
 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

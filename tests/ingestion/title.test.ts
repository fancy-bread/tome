// extractTitle had no direct test coverage before this file — its only
// exercise was indirectly through url-crawler.test.ts, which never
// asserted on title and so never caught that Turndown's default setext
// heading style (fixed in crawler.ts) defeated this regex entirely for
// every real <h1>/<h2>. These tests cover the function in isolation.

import { describe, expect, it } from 'vitest';
import { extractTitle } from '../../src/ingestion/title.js';

describe('extractTitle', () => {
  it('extracts an ATX h1', () => {
    expect(extractTitle('# Widget Guide\n\nBody text.')).toBe('Widget Guide');
  });

  it('extracts an ATX heading at any level 1-6', () => {
    expect(extractTitle('###### Deep Heading\n\nBody.')).toBe('Deep Heading');
  });

  it('trims surrounding whitespace from the heading text', () => {
    expect(extractTitle('#   Padded Title   \n\nBody.')).toBe('Padded Title');
  });

  it('uses the first heading when multiple are present', () => {
    expect(extractTitle('# First\n\nBody\n\n## Second')).toBe('First');
  });

  it('returns null when no heading is present', () => {
    expect(extractTitle('Just a paragraph with no heading.')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(extractTitle('')).toBeNull();
  });

  it('does not match a setext-style heading (Turndown must emit ATX for this to work)', () => {
    expect(extractTitle('Widget Guide\n============\n\nBody text.')).toBeNull();
  });
});

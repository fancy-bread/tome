import { describe, expect, it } from 'vitest';
import { DefaultChunker } from '../../src/ingestion/chunker.js';

/** Pads a marker string with filler sentences to a target length. */
function paragraph(marker: string, targetLength: number): string {
  let text = `${marker}: `;
  while (text.length < targetLength) {
    text += 'This is filler content for a chunking test. ';
  }
  return text.trim();
}

describe('DefaultChunker (User Story 4)', () => {
  it('prefers paragraph boundaries over mid-sentence splits when chunking multi-section text', () => {
    const sectionA = paragraph('SECTION-A', 2100);
    const sectionB = paragraph('SECTION-B', 2100);
    const sectionC = paragraph('SECTION-C', 2100);
    const text = [sectionA, sectionB, sectionC].join('\n\n');

    const chunks = new DefaultChunker().chunk('doc-1', text);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].text.startsWith('SECTION-A')).toBe(true);
    // Each later chunk's own paragraph starts cleanly right after the
    // overlap-and-separator prefix — not mid-word.
    expect(chunks[1].text).toContain('\n\nSECTION-B');
    expect(chunks[2].text).toContain('\n\nSECTION-C');
  });

  it('never splits a fenced code block across two chunks', () => {
    const before = paragraph('BEFORE', 1900);
    const codeBlock = '```\nline one\n\nline two (blank line above, inside the fence)\n```';
    const after = paragraph('AFTER', 1900);
    const text = [before, codeBlock, after].join('\n\n');

    const chunks = new DefaultChunker().chunk('doc-1', text);

    for (const c of chunks) {
      const fenceCount = (c.text.match(/```/g) ?? []).length;
      expect(fenceCount % 2).toBe(0); // never an odd, torn fence
    }
  });

  it('adjacent chunks share an overlapping region', () => {
    const sectionA = paragraph('SECTION-A', 2100);
    const sectionB = paragraph('SECTION-B', 2100);
    const text = [sectionA, sectionB].join('\n\n');

    const chunks = new DefaultChunker().chunk('doc-1', text);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const tailOfFirst = chunks[0].text.slice(-50);
    expect(chunks[1].text).toContain(tailOfFirst);
  });

  it('produces identical ordinals and text when chunking the same unchanged content twice (FR-010, SC-004)', () => {
    const text = [paragraph('A', 2100), paragraph('B', 2100), paragraph('C', 2100)].join('\n\n');

    const first = new DefaultChunker().chunk('doc-1', text);
    const second = new DefaultChunker().chunk('doc-1', text);

    expect(second.map((c) => ({ ordinal: c.ordinal, text: c.text }))).toEqual(
      first.map((c) => ({ ordinal: c.ordinal, text: c.text })),
    );
  });

  it('produces exactly one chunk for text shorter than the target chunk size', () => {
    const chunks = new DefaultChunker().chunk('doc-1', 'Just a short sentence.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ordinal).toBe(0);
    expect(chunks[0].text).toBe('Just a short sentence.');
    expect(chunks[0].embedding).toBeNull();
  });

  it('produces zero chunks for empty (or whitespace-only) text', () => {
    expect(new DefaultChunker().chunk('doc-1', '')).toEqual([]);
    expect(new DefaultChunker().chunk('doc-1', '   \n  ')).toEqual([]);
  });
});

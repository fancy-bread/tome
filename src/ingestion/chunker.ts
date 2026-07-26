// Contract for splitting a Document's raw text into overlapping Chunks.
// See specs/002-ingestion-pipeline/spec.md FR-009 through FR-011.
//
// Must not import from src/storage/ or any embedding module (Constitution
// Principle IV) — a Chunker is usable standalone, consuming only the text
// handed to it, with no DocumentIndex or Embedder present.

import { randomUUID } from 'node:crypto';
import type { Chunk } from '../core/types.js';

export interface Chunker {
  /**
   * Splits `text` into overlapping Chunks belonging to `documentId`,
   * preferring header/paragraph boundaries over mid-sentence or
   * mid-code-block splits (FR-009). Ordinals are stable across repeated
   * calls with unchanged text (FR-010). Returns exactly one chunk for
   * text shorter than the target chunk size, and [] for empty text
   * (FR-011). Every returned chunk's `embedding` is null.
   */
  chunk(documentId: string, text: string): Chunk[];
}

// ~500 tokens at the ~4-chars-per-token approximation from research.md.
const TARGET_CHARS = 2000;
const OVERLAP_CHARS = Math.round(TARGET_CHARS * 0.15);

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

export class DefaultChunker implements Chunker {
  chunk(documentId: string, text: string): Chunk[] {
    if (text.trim().length === 0) return [];

    const blocks = splitIntoBlocks(text);
    const groups = groupBlocksIntoChunks(blocks, TARGET_CHARS);
    const chunkTexts = applyOverlap(groups, OVERLAP_CHARS);

    return chunkTexts.map((chunkText, ordinal) => ({
      id: randomUUID(),
      documentId,
      ordinal,
      text: chunkText,
      embedding: null,
      tokenCount: Math.ceil(chunkText.length / 4),
    }));
  }
}

/**
 * Splits text into atomic units — fenced code blocks (never split
 * internally) and paragraphs/headers (split on blank lines and before
 * heading lines) — in original order.
 */
function splitIntoBlocks(text: string): string[] {
  const blocks: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CODE_BLOCK_PATTERN.lastIndex = 0;
  while ((match = CODE_BLOCK_PATTERN.exec(text))) {
    blocks.push(...splitParagraphs(text.slice(lastIndex, match.index)));
    blocks.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  blocks.push(...splitParagraphs(text.slice(lastIndex)));

  return blocks.filter((block) => block.trim().length > 0);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .flatMap((paragraph) => paragraph.split(/(?=^#{1,6}\s)/m));
}

/**
 * Greedily packs blocks into groups targeting `targetChars` each, never
 * splitting a block across two groups (FR-009's boundary preference).
 */
function groupBlocksIntoChunks(blocks: string[], targetChars: number): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const block of blocks) {
    if (currentLength > 0 && currentLength + block.length > targetChars) {
      groups.push(current.join('\n\n'));
      current = [];
      currentLength = 0;
    }
    current.push(block);
    currentLength += block.length;
  }
  if (current.length > 0) {
    groups.push(current.join('\n\n'));
  }

  return groups;
}

/** Prefixes each chunk (after the first) with the tail of the previous chunk's text. */
function applyOverlap(groups: string[], overlapChars: number): string[] {
  if (groups.length <= 1) return groups;
  return groups.map((group, i) => {
    if (i === 0) return group;
    const previous = groups[i - 1];
    const overlapText = previous.slice(Math.max(0, previous.length - overlapChars));
    return `${overlapText}\n\n${group}`;
  });
}

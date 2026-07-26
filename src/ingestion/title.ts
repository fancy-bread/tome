/**
 * Extracts a Document's title as the first Markdown-style heading
 * (`# ...`) found in its text, or null if there isn't one. Applied
 * uniformly across all source types — HTML is already converted to
 * Markdown by the time this runs, and .txt/PDF text simply won't match,
 * correctly falling back to null (see research.md's "Title extraction").
 */
export function extractTitle(text: string): string | null {
  const match = text.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

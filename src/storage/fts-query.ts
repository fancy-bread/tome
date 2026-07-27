/**
 * Sanitizes a free-text query for FTS5's MATCH operand. FTS5 has its own
 * query grammar (AND/OR/NOT/NEAR, prefix *, column filters) — passing a
 * caller's raw text through unescaped means ordinary characters like `-`
 * or `"` either throw a syntax error or silently change meaning. This
 * quotes every token as a literal phrase term, escaping embedded quotes,
 * per specs/003-sqlite-document-index/research.md.
 *
 * Returns null for a query with no meaningful tokens (e.g. empty or
 * whitespace-only) — callers should treat that as "no match" rather than
 * running an invalid MATCH query.
 */
export function sanitizeFtsQuery(query: string): string | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' ');
}

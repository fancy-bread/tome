// The fifth MCP tool this milestone adds, alongside the four from
// specs/004-mcp-server/contracts/tools.ts (unchanged by this feature).
// See spec.md FR-001 through FR-004.
//
// Unlike tome_search/tome_fetch, this tool's description does not need
// Constitution Principle III's "drives unprompted invocation" review —
// removal is the one MCP-surfaced action VISION.md is explicit must stay
// a deliberate human call (see spec.md FR-005), so under-selling
// proactive use here is correct behavior, not a functional regression.

import type { ToolDefinition } from '../../004-mcp-server/contracts/tools.js';

export const TOME_REMOVE_SOURCE: ToolDefinition = {
  name: 'tome_remove_source',
  description:
    'Remove a previously indexed source and delete everything indexed under it ' +
    '(its documents, chunks, and embeddings). This is a deliberate, irreversible ' +
    'action — only call this when the user has explicitly asked to remove a ' +
    'specific source, never on your own initiative.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
  },
};

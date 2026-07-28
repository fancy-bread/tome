// The four MCP tool definitions this milestone exposes. See
// specs/004-mcp-server/spec.md FR-002 through FR-006, FR-010, and
// specs/004-mcp-server/contracts/tools.ts for the original design sketch
// (authored there as plain JSON Schema; here as Zod raw shapes, which
// McpServer.registerTool expects and auto-converts to the same JSON
// Schema shape on the wire — confirmed empirically, see research.md).
//
// tome_search and tome_fetch's `description` fields are a first-class
// design artifact (Constitution Principle III) — they're what drives an
// agent to call these tools unprompted, mid-task. Changing them requires
// the same review rigor as changing inputSchema, per the constitution's
// Development Workflow section.

import { z } from 'zod';

export const TOME_SEARCH = {
  name: 'tome_search',
  description:
    'Search indexed documentation for content relevant to the current task. ' +
    'Call this proactively whenever the task might benefit from indexed reference ' +
    'material — library docs, internal API specs, ADRs, runbooks — do not wait for ' +
    'the user to explicitly ask for a documentation lookup.',
  inputSchema: {
    query: z.string(),
    limit: z.number().int().optional().default(10),
    sourceId: z.string().optional(),
  },
};

export const TOME_FETCH = {
  name: 'tome_fetch',
  description:
    "Retrieve the full chunk or document behind a tome_search result. Call this " +
    "proactively when a search result's excerpt isn't enough context to act on — " +
    'do not wait for the user to ask for the full content.',
  inputSchema: {
    id: z.string(),
  },
};

export const TOME_LIST_SOURCES = {
  name: 'tome_list_sources',
  description: 'List all indexed sources and their current status.',
  inputSchema: {},
};

export const TOME_ADD_SOURCE = {
  name: 'tome_add_source',
  description:
    'Index a new URL, local path, or git repository. Re-indexes if the source ' +
    'already exists.',
  inputSchema: {
    type: z.enum(['url', 'path', 'git']),
    origin: z.string(),
  },
};

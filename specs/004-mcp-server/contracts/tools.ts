// The four MCP tool definitions this milestone exposes. See
// specs/004-mcp-server/spec.md FR-002 through FR-006, FR-010, and
// data-model.md for the response shapes each maps to.
//
// tome_search and tome_fetch's `description` fields are a first-class
// design artifact (Constitution Principle III) — they're what drives an
// agent to call these tools unprompted, mid-task. Changing them requires
// the same review rigor as changing inputSchema, per the constitution's
// Development Workflow section.

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOME_SEARCH: ToolDefinition = {
  name: 'tome_search',
  description:
    'Search indexed documentation for content relevant to the current task. ' +
    'Call this proactively whenever the task might benefit from indexed reference ' +
    'material — library docs, internal API specs, ADRs, runbooks — do not wait for ' +
    'the user to explicitly ask for a documentation lookup.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer', default: 10 },
      sourceId: { type: 'string' },
    },
    required: ['query'],
  },
};

export const TOME_FETCH: ToolDefinition = {
  name: 'tome_fetch',
  description:
    "Retrieve the full chunk or document behind a tome_search result. Call this " +
    "proactively when a search result's excerpt isn't enough context to act on — " +
    'do not wait for the user to ask for the full content.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
  },
};

export const TOME_LIST_SOURCES: ToolDefinition = {
  name: 'tome_list_sources',
  description: 'List all indexed sources and their current status.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const TOME_ADD_SOURCE: ToolDefinition = {
  name: 'tome_add_source',
  description:
    'Index a new URL, local path, or git repository. Re-indexes if the source ' +
    'already exists.',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['url', 'path', 'git'] },
      origin: { type: 'string' },
    },
    required: ['type', 'origin'],
  },
};

export const TOME_TOOLS: ToolDefinition[] = [TOME_SEARCH, TOME_FETCH, TOME_LIST_SOURCES, TOME_ADD_SOURCE];

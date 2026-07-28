# Feature Specification: MCP Server

**Feature Branch**: `004-mcp-server`
**Created**: 2026-07-27
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Start the Daemon and Discover Its Tools (Priority: P1)

An MCP client connects to the Tome server over stdio and discovers the
four tools it exposes — `tome_search`, `tome_fetch`, `tome_list_sources`,
`tome_add_source` — each with a name, description, and input schema.

**Why this priority**: Named in the roadmap as the first real end-to-end
vertical slice — nothing else in this milestone matters if a client can't
even see what the server offers. Every other story depends on this one.

**Independent Test**: Start the server, connect a client to it over
stdio, and list the tools it advertises; confirm all four are present
with usable descriptions and schemas.

**Acceptance Scenarios**:

1. **Given** the server has started, **When** a client requests the tool
   list, **Then** all four tools are returned, each with a name,
   description, and input schema.
2. **Given** the server is running, **When** it receives no tool calls at
   all, **Then** it remains available and responsive to a client that
   connects later.

---

### User Story 2 — Add a Source via MCP (Priority: P1)

An MCP client calls `tome_add_source` with a source type and origin. The
server registers it through the underlying index and returns the new
source's identifier and status.

**Why this priority**: Without a way to add a source over the protocol,
nothing exists for the other tools to search, fetch, or list.

**Independent Test**: Call `tome_add_source` with a valid source; confirm
the response includes an identifier and a pending/indexing status,
matching what direct use of the index would produce.

**Acceptance Scenarios**:

1. **Given** a valid source type and origin, **When** `tome_add_source`
   is called, **Then** the response includes a source identifier and a
   pending or indexing status.
2. **Given** an origin that's already been added, **When**
   `tome_add_source` is called again with it, **Then** the response
   reflects a refresh of the existing source, not a new one.
3. **Given** a call missing a required argument, **When**
   `tome_add_source` is called, **Then** the response is a structured
   tool-call error, not a crashed server.

---

### User Story 3 — Search Indexed Content via MCP (Priority: P1)

An MCP client calls `tome_search` with a query and receives ranked
results with their source metadata.

**Why this priority**: This is the tool an agent is expected to reach for
unprompted, mid-task — it's the primary payoff the whole product exists
to deliver, and this milestone is what makes it real (not seeded test
data) for the first time.

**Independent Test**: Add a source, wait for it to finish indexing, call
`tome_search` with text known to be in it, and confirm ranked results
come back with source metadata attached.

**Acceptance Scenarios**:

1. **Given** indexed content relevant to a query, **When** `tome_search`
   is called, **Then** ranked results are returned with their source
   metadata.
2. **Given** a query matching nothing, **When** `tome_search` is called,
   **Then** an empty result set is returned, not an error.
3. **Given** the tool's description as advertised to a client, **When**
   it's read on its own, **Then** it instructs the calling agent to use
   the tool proactively and unprompted — not merely describing its
   inputs and outputs.

---

### User Story 4 — Retrieve Content by Identifier via MCP (Priority: P1)

An MCP client calls `tome_fetch` with an identifier from a prior search
result and receives the full content behind it.

**Why this priority**: Search results are excerpts; retrieving the full
record behind one, over the same protocol, completes the primary
agent-facing loop this product is built around.

**Independent Test**: Fetch a known identifier and confirm the full
content is returned; fetch an unknown identifier and confirm a structured
tool-call error, with the server still responsive afterward.

**Acceptance Scenarios**:

1. **Given** a known chunk or document identifier, **When** `tome_fetch`
   is called, **Then** the full content is returned.
2. **Given** an identifier that doesn't resolve to anything, **When**
   `tome_fetch` is called, **Then** the response is a structured
   tool-call error, and the server remains available for the next call.
3. **Given** the tool's description as advertised to a client, **When**
   it's read on its own, **Then** it instructs the calling agent to use
   the tool proactively and unprompted, the same as `tome_search`'s.

---

### User Story 5 — List Sources via MCP (Priority: P2)

An MCP client calls `tome_list_sources` and receives every added
source's current type, origin, status, and last-indexed time.

**Why this priority**: Checking on indexing progress matters, but less
than the add/search/fetch loop the other stories cover — this is how a
client confirms what's already there, not how it gets value day to day.

**Independent Test**: Add two sources, call `tome_list_sources`, and
confirm both appear with accurate, current status.

**Acceptance Scenarios**:

1. **Given** sources in different states, **When** `tome_list_sources`
   is called, **Then** every one is returned with its real, current
   status and last-indexed time.

---

### Edge Cases

- What happens when `tome_add_source` is called with a malformed or
  missing required argument? A structured tool-call error is returned,
  not a crash.
- What happens when `tome_search` is scoped to a source id that doesn't
  exist? The same behavior the underlying index already guarantees —
  an empty result set, not an error — carried through the protocol
  boundary unchanged.
- What happens when a search call arrives while a different source is
  still being indexed in the background? Both are handled independently;
  the search operates on whatever is already persisted, consistent with
  the non-blocking indexing behavior the underlying index already
  provides.
- What happens when a tool call triggers an unexpected failure inside the
  server, not one of the specific errors already named above? It's
  returned as a structured tool-call error; the server keeps handling
  subsequent, unrelated calls normally.

## Requirements

### Functional Requirements

- **FR-001**: The server MUST start and communicate with an MCP client
  over the stdio transport.
- **FR-002**: The server MUST advertise exactly four tools —
  `tome_search`, `tome_fetch`, `tome_list_sources`, `tome_add_source` —
  each discoverable with a name, description, and input schema.
- **FR-003**: `tome_add_source` MUST register a source through the
  underlying index and return its identifier and status.
- **FR-004**: `tome_search` MUST return ranked results with their source
  metadata for a given query.
- **FR-005**: `tome_fetch` MUST return the full content for a given
  identifier.
- **FR-006**: `tome_list_sources` MUST return every added source's
  current type, origin, status, and last-indexed time.
- **FR-007**: `tome_fetch` MUST return a structured tool-call error,
  never a crashed server, when the given identifier doesn't resolve to
  anything.
- **FR-008**: Any unexpected failure while handling one tool call MUST be
  caught and returned as a structured tool-call error rather than
  crashing the server — one failed call MUST NOT prevent the server from
  handling the next one.
- **FR-009**: A tool call with a missing or invalid required argument
  MUST return a structured tool-call error rather than crashing the
  server.
- **FR-010**: `tome_search`'s and `tome_fetch`'s descriptions MUST
  instruct the calling agent to invoke them proactively, mid-task,
  without waiting to be asked — description quality for these two tools
  is a functional requirement, not a documentation nicety.
- **FR-011**: The server MUST be constructible against a real,
  file-backed index, so tool responses reflect actually persisted
  content rather than test-only seeded or stubbed data.

### Key Entities

- No new persisted entities. This milestone exposes `Source`, `Document`,
  `Chunk`, and `RankedChunk` (all from milestone 001) over MCP tool
  responses — the request/response shapes are protocol-level framing
  around those existing types, not new data.

## Success Criteria

- **SC-001**: A connecting MCP client can discover all four tools with
  usable descriptions and schemas.
- **SC-002**: The full sequence — add a source, wait for it to index,
  search it, fetch a result by id, list sources — completes entirely
  through MCP tool calls with accurate results at each step.
- **SC-003**: `tome_fetch` called with an unknown identifier returns an
  observable tool-call error without leaving the server unresponsive to
  subsequent calls.
- **SC-004**: An unexpected failure in one tool call never prevents a
  later, unrelated tool call from succeeding within the same server
  session.
- **SC-005**: `tome_search` and `tome_fetch`'s advertised descriptions,
  read on their own, instruct proactive and unprompted use — verifiable
  by inspecting the description text itself, not only by successful
  invocation.

## Assumptions

- Real semantic embeddings are still out of scope — the index this
  milestone wires in still uses a stub `Embedder` (milestone 005's job),
  consistent with milestone 003.
- The human-facing skill files (`/tome-add`, `/tome-sources`,
  `/tome-search`) are out of scope — milestone 006. This milestone only
  makes the tools reachable by any MCP client, agent-driven or otherwise.
- Claude Code plugin packaging (how the plugin harness starts this
  process, `plugin.json`) is out of scope — milestone 007. For this
  milestone, the server can be started directly (e.g., as a standalone
  process) for development and testing.
- Where the index's SQLite file lives in a real deployment follows the
  constitution's durable plugin-data-directory convention; this
  milestone's own tests use a temp file or `:memory:`, consistent with
  milestones 001 and 003.

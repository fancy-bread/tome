# Feature Specification: Skill Files

**Feature Branch**: `006-skill-files`
**Created**: 2026-07-27
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Explicitly Add a Source via a Slash Command (Priority: P1)

A user types `/tome:add` with a source type and origin (a URL, local
path, or git repo). Without further back-and-forth, the source gets
added — the same outcome as calling `tome_add_source` directly, but
reachable by name instead of relying on the agent to reach for the MCP
tool unprompted.

**Why this priority**: Deciding what to index is inherently a human
call — an agent has no basis for guessing which docs a user wants
indexed. Without this command, a user has no direct way to trigger
indexing; they'd have to hope the agent infers the intent from
conversation.

**Independent Test**: Type `/tome:add` with a valid type and origin;
confirm the source gets added and its id/status is reported back,
matching what a direct `tome_add_source` call would produce.

**Acceptance Scenarios**:

1. **Given** a valid source type and origin, **When** `/tome:add` is
   invoked with them, **Then** the source is added and its identifier
   and status are reported to the user.
2. **Given** `/tome:add` is invoked with a missing or malformed argument,
   **When** the command runs, **Then** the user is prompted for the
   missing information rather than the command guessing or failing
   silently.

---

### User Story 2 — Check What's Indexed via a Slash Command (Priority: P2)

A user types `/tome:sources` and sees every source that's been added,
along with its current status (pending, indexing, ready, or error) and
when it was last indexed.

**Why this priority**: Checking status is a human call too, but less
urgent than adding a source in the first place — there's nothing to
check status on until at least one source exists.

**Independent Test**: Add two sources in different states, invoke
`/tome:sources`, and confirm both appear with accurate, current status.

**Acceptance Scenarios**:

1. **Given** one or more sources have been added, **When**
   `/tome:sources` is invoked, **Then** every source's current type,
   origin, status, and last-indexed time is shown.
2. **Given** no sources have been added yet, **When** `/tome:sources` is
   invoked, **Then** the user is told nothing is indexed yet, not shown
   an error.

---

### User Story 3 — Manually Query the Index via a Slash Command (Priority: P3)

A user types `/tome:search` with a query and sees ranked results —
useful when a user wants to look something up directly rather than wait
for the agent to decide to search on its own.

**Why this priority**: This command is explicitly an optional override.
The primary way `tome_search` gets used is the agent calling it
unprompted mid-task (milestone 004's whole point) — this command exists
for the cases where a human wants that same lookup on demand, which is a
real but secondary need.

**Independent Test**: Add and index a source, invoke `/tome:search` with
a query matching its content, and confirm ranked results are shown.

**Acceptance Scenarios**:

1. **Given** indexed content relevant to a query, **When** `/tome:search`
   is invoked with it, **Then** ranked results are shown to the user.
2. **Given** `/tome:search` is invoked with no query, **When** the
   command runs, **Then** the user is prompted for one rather than an
   empty search being run.

---

### Edge Cases

- What happens when the underlying MCP tool call itself fails (e.g.
  `tome_add_source` returns an error)? The failure is surfaced to the
  user in a readable way, not as a raw crash or a silently swallowed
  failure.
- What happens when `/tome:search` matches nothing? The user is told
  there are no results, not shown an error.
- What happens when a user provides extra or oddly-formatted input to
  any of the three commands? The command interprets what it reasonably
  can and asks for clarification on the rest, rather than rejecting the
  whole request outright.

## Requirements

### Functional Requirements

- **FR-001**: A skill command MUST exist for each of adding a source,
  listing sources, and searching — reachable as `/tome:add`,
  `/tome:sources`, and `/tome:search` respectively.
- **FR-002**: `/tome:add` MUST accept a source type and origin and result
  in that source being added through the existing `tome_add_source`
  capability, with the resulting identifier and status reported back to
  the user.
- **FR-003**: `/tome:sources` MUST result in every currently-added
  source's type, origin, status, and last-indexed time being shown to
  the user, through the existing `tome_list_sources` capability.
- **FR-004**: `/tome:search` MUST accept a query and result in ranked
  results being shown to the user, through the existing `tome_search`
  capability.
- **FR-005**: Each of the three commands MUST be independently
  discoverable and invocable by name, without requiring the other two.
- **FR-006**: `/tome:add` invoked without a usable type or origin MUST
  prompt the user for the missing information rather than guessing or
  silently failing.
- **FR-007**: `/tome:search` invoked without a usable query MUST prompt
  the user for one rather than running an empty search.
- **FR-008**: None of the three commands may duplicate or bypass logic
  already provided by the milestone 004 MCP tools (e.g. independent
  crawling, ranking, or status-tracking code) — each is a thin,
  human-facing entry point onto an existing capability, not a new
  implementation of it.
- **FR-009**: A failure surfaced by the underlying MCP tool call MUST be
  shown to the user in a readable way, not as an unhandled failure.

### Key Entities

- No new persisted entities. These three commands are human-facing entry
  points onto `tome_add_source`, `tome_list_sources`, and `tome_search`
  (all from milestone 004) — no new data is introduced.

## Success Criteria

- **SC-001**: A user can add a source by name (`/tome:add`) without
  needing to know the underlying MCP tool's name or argument shape.
- **SC-002**: A user can check what's indexed (`/tome:sources`) and see
  accurate, current status for every source, without needing to inspect
  anything beyond the command's own output.
- **SC-003**: A user can manually query the index (`/tome:search`) and
  get ranked results produced by the same `tome_search` capability the
  agent calls on its own — no separate or reduced ranking logic behind
  the manual command.
- **SC-004**: Each command handles missing or malformed input by asking
  a clarifying question, never by silently failing or crashing.
- **SC-005**: All three commands work independently of each other — a
  user can use any one of them without having used the others first.

## Assumptions

- The MCP server and its four tools (milestone 004) are assumed already
  running and reachable; these three commands are human-facing entry
  points onto that existing capability, not new capability of their own.
- How these commands get bundled and installed alongside the MCP server
  as a single Claude Code plugin (`plugin.json`) is milestone 007's job,
  out of scope here. This milestone only needs the three commands to
  exist and work correctly during development, ahead of that packaging
  step.
- Real local embedding (milestone 005) requires no special handling
  here — `/tome:search` and `/tome:add` behave correctly regardless of
  whether semantic ranking is currently available, the same
  graceful-degradation guarantee the underlying tools already provide.
- The precise file format and location a slash-command skill must use to
  be discoverable by a given host tool is a technical detail for
  planning, not a product requirement — this spec only requires that the
  three commands exist and behave as described, not how they're
  physically packaged.

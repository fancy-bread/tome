# Feature Specification: Claude Code Plugin Packaging

**Feature Branch**: `007-plugin-packaging`
**Created**: 2026-07-28
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Install Tome with One Command and Have It Just Work (Priority: P1)

A user runs a single install command against this repository. Without
any further manual step — no separate build, no dependency install, no
manual MCP server registration — both the four MCP tools (milestone 004)
and the three skill commands (milestone 006) are available in their
Claude Code session.

**Why this priority**: This is the entire point of the milestone, and
the PRD's core distribution promise. Every capability built in
milestones 001–006 is real, but until this one, using any of it
required knowing this is a source repository and running it by hand.
This is what turns "a bunch of working code" into "an installable
product" — what a user installing Tome for the first time actually
experiences.

**Independent Test**: Install the plugin from this repository into a
clean Claude Code environment; confirm all four MCP tools and all three
skill commands are available with no manual step beyond the install
command itself.

**Acceptance Scenarios**:

1. **Given** a clean Claude Code environment with no prior Tome install,
   **When** the plugin is installed from this repository, **Then** all
   four MCP tools and all three skill commands become available without
   any manual build, dependency-install, or registration step.
2. **Given** the plugin has just been installed, **When** a skill
   command (e.g. `/tome:sources`) is invoked, **Then** it works
   immediately — not just the manifest loading, but the underlying MCP
   server actually starting and responding.

---

### User Story 2 — Indexed Content Persists Across Sessions (Priority: P2)

A user adds a source, closes Claude Code, and reopens it later. The
previously indexed content is still there — no re-indexing, no manual
data-directory setup, because the installed plugin stores its index in
the durable, per-plugin data location the Claude Code plugin harness
provides.

**Why this priority**: Without this, every session would start from an
empty index, defeating the entire product — but it's still secondary to
US1, since nothing persists until the plugin can actually be installed
and run at all.

**Independent Test**: Install the plugin, add a source, close and reopen
the Claude Code session, and confirm the previously added source and its
indexed content are still there without re-adding it.

**Acceptance Scenarios**:

1. **Given** a source has been added and indexed, **When** the Claude
   Code session is closed and a new one is started, **Then** the source
   and its indexed content are still available without re-adding it.
2. **Given** the plugin has never been installed before on a given
   machine, **When** it's installed and a source is added, **Then** no
   manual data-directory creation or configuration is required first.

---

### Edge Cases

- What happens when the plugin is installed but its runtime dependencies
  haven't been built/installed yet? The install process results in a
  fully working plugin — a user is never expected to run a separate
  build step by hand after installing.
- What happens when the plugin is installed a second time (e.g. an
  update) on a machine that already has indexed content? Previously
  indexed content is not lost as a side effect of reinstalling or
  updating.
- What happens when the MCP server fails to start after installation
  (e.g. a corrupted local state)? Claude Code does not proactively
  surface an MCP server startup failure to the user by default — it is
  silently skipped, diagnosable only via `claude --debug`. Since this is
  a platform behavior outside this milestone's control, the achievable
  guarantee is that this troubleshooting path is documented for the
  user, not that Claude Code itself displays an error.

## Requirements

### Functional Requirements

- **FR-001**: A plugin manifest MUST exist declaring the MCP server so
  the Claude Code plugin harness can start it as part of installing this
  repository as a plugin.
- **FR-002**: Installing the plugin MUST make all four MCP tools
  (`tome_search`, `tome_fetch`, `tome_list_sources`, `tome_add_source`)
  and all three skill commands (`/tome:add`, `/tome:sources`,
  `/tome:search`) available without any manual step beyond the install
  command itself.
- **FR-003**: Installing the plugin MUST NOT require the user to
  manually run a build step, install dependencies, or manually register
  the MCP server — all of that MUST happen as part of installation.
- **FR-004**: The installed MCP server MUST store its index in the
  durable, per-plugin data directory the Claude Code plugin harness
  provides, rather than a location that could be cleared between
  sessions.
- **FR-005**: The plugin MUST be installable directly from this
  project's git repository, with no separate marketplace registration
  required.
- **FR-006**: The plugin manifest MUST declare enough identifying
  metadata (at minimum a name and description) for it to be
  recognizable in Claude Code's plugin listing.
- **FR-007**: Since Claude Code does not proactively surface an MCP
  server startup failure to the user by default, Tome's own
  documentation MUST tell the user how to diagnose one (via Claude
  Code's debug output) when the tools or commands don't appear after
  installation.

### Key Entities

- No new persisted entities. This milestone packages existing
  capability (milestones 004's MCP server, 005's embedding, 006's skill
  commands) into one installable unit — no new data is introduced.

## Success Criteria

- **SC-001**: A user can go from "has this repository" to "all seven
  Tome capabilities (four MCP tools, three skill commands) working in
  their Claude Code session" using a single install command, with no
  manual build or configuration step in between.
- **SC-002**: Indexed content survives closing and reopening a Claude
  Code session without any manual re-indexing or data-directory setup.
- **SC-003**: Reinstalling or updating the plugin does not discard
  previously indexed content.
- **SC-004**: A failure starting the MCP server after installation is
  diagnosable by the user via a documented troubleshooting step —
  achievable given that Claude Code itself does not proactively display
  this class of failure, a platform behavior this milestone documents
  around rather than overrides.

## Assumptions

- The exact plugin manifest file location and field schema (e.g.
  whether the MCP server entry's shape matches `tdd.md`'s original
  sketch or differs, the same kind of discrepancy milestone 006 found
  and corrected for skill files) is a technical detail for planning to
  verify against Claude Code's actual current plugin documentation, not
  a product requirement decided here.
- Whether the plugin harness runs a build step (e.g. `npm install` /
  `npm run build`) automatically on install, or expects a pre-built
  `dist/` to already be present in the repository, is also a technical
  unknown for planning to resolve — FR-003's "no manual build step"
  guarantee must hold either way, but *how* it holds (harness-driven
  build vs. a committed build artifact) is an implementation decision.
- The skill commands (milestone 006) are already correctly
  auto-discoverable from the `skills/` directory with no explicit
  manifest declaration, per milestone 006's own verified research —
  this milestone does not need to re-verify that, only confirm it still
  holds under a real install (not just `--plugin-dir` dev-mode loading).
- A hosted marketplace listing (`marketplace.json`) remains out of scope
  — git-based installation is sufficient for v1, per the PRD.
- Real local embedding (milestone 005) and its graceful degradation to
  lexical search when Ollama is unavailable require no special handling
  here — installation and packaging are orthogonal to whether Ollama
  happens to be present on the installing user's machine.

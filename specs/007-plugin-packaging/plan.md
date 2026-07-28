# Implementation Plan: Claude Code Plugin Packaging

**Branch**: `007-plugin-packaging` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-plugin-packaging/spec.md`

## Summary

Package the existing MCP server (milestone 004), local embedding
(milestone 005), and skill commands (milestone 006) into an installable
Claude Code plugin. This required resolving two real technical unknowns
flagged in spec.md's Assumptions — both turned out to differ
substantially from `tdd.md`'s original sketch, discovered via direct
verification against Claude Code's official documentation rather than
guessed: (1) MCP servers are declared in a separate `.mcp.json`, not
inside `plugin.json`; (2) `claude plugin install` never runs a build
step, and this project's native dependencies (`better-sqlite3`,
`sqlite-vec`) can't simply be committed pre-built, so a `SessionStart`
hook running `npm install && npm run build` on first use is required.
Research for this milestone also caught and corrected a genuine bug in
already-shipped code: `src/index.ts` reads `CLAUDE_PLUGIN_DATA_DIR`, but
the real Claude Code environment variable is `CLAUDE_PLUGIN_DATA` — as
shipped, an installed Tome would silently never use the harness's
durable directory, undermining this milestone's own FR-004.

## Technical Context

**Language/Version**: TypeScript/Node.js 24 LTS (unchanged) for the one
real code fix (`src/index.ts`'s environment variable name); JSON for the
three new plugin configuration files.

**Primary Dependencies**: None new. No npm package is required for
packaging — `.claude-plugin/plugin.json`, `.mcp.json`, and
`hooks/hooks.json` are plain JSON files Claude Code itself parses.

**Storage**: N/A — no new persisted entities (spec.md's Key Entities:
none). The *location* of the existing SQLite file changes in effect
(from the fixed fallback default to the harness's real
`CLAUDE_PLUGIN_DATA` directory), but the schema and `SqliteDocumentIndex`
are unchanged.

**Testing**: Vitest for the two things that are genuinely testable
without a live Claude Code harness: (1) `resolveDbPath`'s corrected
environment variable name (a one-line existing-test update), and (2)
each new JSON config file's structural validity (parses, has the
required fields, the hook command contains the expected idempotency
guard). Whether the harness *actually* runs the hook, injects the
variables, and starts the server correctly is a live-session concern —
same limitation milestone 006 accepted for its skill files — covered by
quickstart.md's manual verification, not `vitest`.

**Target Platform**: Claude Code plugin installation (`claude plugin
install`), verified this milestone against the real mechanism rather
than `tdd.md`'s original sketch (research.md #1–#2).

**Project Type**: Single project (unchanged). Adds
`.claude-plugin/plugin.json`, `.mcp.json`, and `hooks/hooks.json` at the
repository root; no new `src/` module, one corrected line in the
existing `src/index.ts`.

**Performance Goals**: The one-time build the `SessionStart` hook
triggers (native module compilation) should not block session startup —
`async: true` is required, confirmed as a real hook field for exactly
this purpose (research.md #2).

**Constraints**: The hook must be idempotent — most sessions after the
first must not re-run `npm install`/`npm run build` (research.md #2's
existence-check decision, an accepted v1 simplification over the docs'
more thorough hash-comparison pattern).

**Scale/Scope**: Three new config files plus one corrected environment
variable name — no new runtime module, no new user-facing capability;
this milestone is entirely about making milestones 004–006's existing
capability installable.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Local-First, Privacy-by-Default** — PASS. Nothing about packaging
  changes what data leaves the device; the `SessionStart` hook's
  `npm install` fetches build tooling, not indexed content, the same
  category of one-time setup as installing Node.js itself, not a
  Principle I concern.
- **II. Graceful Degradation Over Hard Failure** — PASS, corrected during
  `/speckit-analyze` (research.md #6): this Constitution Check
  originally cited milestone 004's `withErrorHandling` pattern to
  justify SC-004, but that pattern only handles failures inside an
  already-running MCP protocol exchange — it says nothing about a
  process that never starts. Verified that Claude Code does not
  proactively surface an MCP server startup failure by default (silently
  skipped, diagnosable only via `claude --debug`); SC-004 and FR-007
  were revised to the achievable guarantee — Tome documents this
  troubleshooting step for the user — rather than a platform behavior
  outside this milestone's control. This is a documentation requirement
  now, not a code-level degradation path, which is why it doesn't
  extend `withErrorHandling`.
- **III. Autonomous-Tool-Quality as a Design Requirement** — N/A. No
  MCP tool description changes.
- **IV. Interface-Segregated Storage & Embedding** — PASS/N/A. No
  interface changes; `SqliteDocumentIndex` and `Embedder` are untouched.
  The `CLAUDE_PLUGIN_DATA` fix is a corrected environment variable name
  in `src/index.ts`'s construction call, not a new interface or a new
  dependency on the plugin harness from inside `SqliteDocumentIndex`
  itself, which still just receives a `dbPath` string.
- **V. Minimal v1 Scope, Explicit Deferral** — PASS. No marketplace
  listing (`marketplace.json` explicitly out of scope, per spec.md's
  Assumptions and the PRD). The hook's idempotency check is a simple
  file-existence test, not the more elaborate package.json-hash-diff
  pattern Claude Code's own docs show as an option — an intentional v1
  simplification (research.md #2), not a gap silently introduced.

**Post-Design Re-Check**: Phase 1 (`data-model.md`, `contracts/`)
introduces three JSON configuration files and one corrected environment
variable name — no new persisted entity, no new public interface, no
new dependency. All five gates above still PASS with no changes to
their reasoning.

## Project Structure

### Documentation (this feature)

```text
specs/007-plugin-packaging/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── contracts/
    └── plugin-packaging.ts  # Phase 1 output
```

### Source Code (repository root)

```text
.claude-plugin/
└── plugin.json           # NEW — name, description, version, author

.mcp.json                 # NEW — declares the tome MCP server

hooks/
└── hooks.json             # NEW — SessionStart: npm install && npm run build

src/
└── index.ts               # MODIFIED — CLAUDE_PLUGIN_DATA_DIR → CLAUDE_PLUGIN_DATA (bug fix)

tests/
├── mcp/
│   └── index.test.ts      # MODIFIED — updated env var name in existing tests
└── plugin/
    └── plugin-config.test.ts  # NEW — structural validation of all three JSON files
```

**Structure Decision**: All three new files live at the repository
root, matching Claude Code's fixed plugin-root convention (confirmed
directly against the docs this milestone — `.claude-plugin/` holds only
`plugin.json`; `.mcp.json` and `hooks/` are siblings of it, never nested
inside it, a mistake the docs explicitly call out as common). `skills/`
(milestone 006) needs no change — already at the plugin root, already
auto-discovered.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*

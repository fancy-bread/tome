# Implementation Plan: Skill Files

**Branch**: `006-skill-files` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-skill-files/spec.md`

## Summary

Three Claude Code skill files — `/tome:add`, `/tome:sources`,
`/tome:search` — each a thin, human-facing instruction layer over one of
milestone 004's existing MCP tools (`tome_add_source`,
`tome_list_sources`, `tome_search` respectively). No new production
TypeScript code: these are Markdown files with YAML frontmatter,
consumed directly by the Claude Code host, not by Tome's own daemon.
Verification is content/structure validation (frontmatter fields, body
instructions) via Vitest, plus a real manual test using Claude Code's
own local-plugin-development flow — no code path in `src/` changes.

## Technical Context

**Language/Version**: Markdown + YAML frontmatter for the skill files
themselves (no TypeScript in the deliverable); TypeScript/Vitest for the
validation tests, unchanged from prior milestones.

**Primary Dependencies**: None new. Frontmatter here is a small set of
flat scalar keys (`name`, `description`, `argument-hint`,
`disable-model-invocation`) — the validation tests parse it with a
hand-rolled delimiter split, not a YAML library, since nothing nested or
nested-list-shaped is involved (research.md #2).

**Storage**: N/A — no new persisted data (spec.md's Key Entities:
none).

**Testing**: Vitest. Tests read the actual `skills/*/SKILL.md` files
from disk and assert on frontmatter fields and body content — the same
content-assertion approach milestone 004 used for `tome_search`'s
proactive-use description text (`toMatch(/proactively/i)`-style checks),
applied here to "does the body name the right MCP tool and the right
missing-argument behavior."

**Target Platform**: Claude Code plugin skill loading. Verified this
milestone (research.md #1): a plugin-shipped skill is a *directory* per
skill under a `skills/` folder at the plugin root
(`skills/<name>/SKILL.md`), auto-discovered by the host with no explicit
manifest entry required — confirmed against Claude Code's own plugins
reference documentation, not assumed from this repo's project-local
`.claude/skills/` convention alone.

**Project Type**: Single project (unchanged). Adds one new top-level
directory, `skills/`, alongside `src/` and `tests/` — not nested under
`src/`, since these files are consumed directly by the Claude Code host
at the plugin root, not imported by Tome's own TypeScript code.

**Performance Goals**: N/A — no runtime code path.

**Constraints**: The skill folder names MUST be exactly `add`,
`sources`, and `search`. Claude Code *does* namespace every plugin
skill's invocation as `plugin-name:skill-name` — corrected during
milestone 007's research after this plan's original text claimed
otherwise (research.md #1's Correction). Since this plugin's own name is
`tome`, the resulting commands are `/tome:add`, `/tome:sources`,
`/tome:search`, matching spec.md's SC-001–SC-003. Naming the folders
`tome-add`/`tome-sources`/`tome-search` (this plan's original choice)
would have produced the redundant `/tome:tome-add` etc. — the folders
were renamed to `add`/`sources`/`search` to avoid that.

**Scale/Scope**: Three skill files, each a thin pass-through to an
existing MCP tool — no batching, no new capability, no configuration
surface, consistent with Principle V.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Local-First, Privacy-by-Default** — PASS. No network call, no
  new data leaves the device; these files only add instruction text
  consumed by the already-local Claude Code host.
- **II. Graceful Degradation Over Hard Failure** — PASS. Each skill's
  body must instruct the agent to surface an underlying MCP tool
  failure readably (FR-009) and to ask for clarification on missing or
  malformed arguments (FR-006/FR-007) rather than guessing or crashing.
- **III. Autonomous-Tool-Quality as a Design Requirement** — N/A, and
  deliberately so: this principle governs `tome_search`/`tome_fetch`'s
  MCP tool descriptions, which drive the agent to call them *unprompted*
  mid-task. These three skills are the opposite mechanism on purpose —
  explicitly human-invoked, with `disable-model-invocation: true` set on
  each (research.md #1) so the model does not invoke the *skill* itself
  autonomously. This is not a lesser version of Principle III; it is the
  PRD's own explicit distinction between "the agent reaches for
  `tome_search` on its own" (milestone 004, unchanged here) and "a human
  explicitly asks for one of these three actions by name." Nothing in
  this milestone touches the MCP tool descriptions Principle III
  governs.
- **IV. Interface-Segregated Storage & Embedding** — PASS/N/A. No
  interface changes; each skill's body calls an MCP tool that already
  exists, unchanged. No skill duplicates or bypasses `DocumentIndex` or
  `Embedder` logic (FR-008).
- **V. Minimal v1 Scope, Explicit Deferral** — PASS. No `plugin.json`
  (milestone 007's job, explicitly out of scope per spec.md's
  Assumptions), no new dependency, no configuration surface for skill
  behavior.

**Post-Design Re-Check**: Phase 1 (`data-model.md`, `contracts/`)
introduces no new persisted entities, no new dependency, and no change
to any existing MCP tool or `DocumentIndex`/`Embedder` interface — only
three new content files and their validation tests. All five gates
above still PASS with no changes to their reasoning.

## Project Structure

### Documentation (this feature)

```text
specs/006-skill-files/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/
    └── skill-file.ts     # Phase 1 output
```

### Source Code (repository root)

```text
skills/
├── add/SKILL.md      # NEW
├── sources/SKILL.md  # NEW
└── search/SKILL.md   # NEW

tests/
└── skills/
    └── skill-files.test.ts  # NEW — frontmatter + body content validation
```

**Structure Decision**: `skills/` is a new top-level directory, a
sibling of `src/` and `tests/`, not nested inside either — it holds
content consumed directly by the Claude Code plugin host at the plugin
root (research.md #1), not TypeScript imported by Tome's own code. This
is the only new top-level surface this milestone adds; everything else
is test-only.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*

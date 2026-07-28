# Quickstart: Skill Files

Validates that the three human-facing slash commands exist, are
correctly structured, and correctly route to their underlying MCP tools
— and, for a real sanity check, that they actually load and run in a
live Claude Code session.

## Prerequisites

- No new dependency (research.md #2 — frontmatter is parsed with a
  hand-rolled split, not a YAML library).
- For the manual test only: a working Claude Code CLI install and, per
  milestone 004/005, the MCP server buildable (`npm run build`) so the
  skills have a real daemon to talk to.

## What gets validated (automated)

```
tests/skills/
└── skill-files.test.ts   # frontmatter + body content checks for all three SKILL.md files
```

## Run it

```bash
npm test
```

## Expected outcome (automated)

- **SC-004** (partial) — `skill-files.test.ts`: each `SKILL.md`'s
  frontmatter has `name` matching its folder, a non-empty `description`,
  and `disable-model-invocation: true`.
- **FR-002/FR-003/FR-004** — `skill-files.test.ts`: each skill's body
  text names the exact MCP tool it must call (`tome_add_source`,
  `tome_list_sources`, `tome_search` respectively) and contains the
  `$ARGUMENTS` placeholder.
- **FR-006/FR-007** (SC-004 continued) — `skill-files.test.ts`:
  `tome-add` and `tome-search`'s bodies instruct the agent to ask the
  user for clarification on a missing/malformed argument, rather than
  guessing.
- **FR-009** — `skill-files.test.ts`: all three bodies instruct the
  agent to surface an underlying tool failure readably.

Content/structure checks are the ceiling of what an automated test can
prove here — whether the agent actually *behaves* as instructed when a
real user types `/tome-add` is a live-agent behavior, not something
`vitest` executes (the same limitation milestone 004 accepted for its
tool-description content assertions).

## Manual smoke test (real Claude Code session)

Confirmed this milestone (research.md #4): no `plugin.json` is required
for this.

```bash
claude --plugin-dir /path/to/tome
```

Inside that session:

```
/reload-plugins
/tome-add path /path/to/some/local/docs
/tome-sources
/tome-search some query relevant to what you just added
```

Expected: `/tome-add` reports back an identifier and status;
`/tome-sources` lists it; `/tome-search` returns ranked results once
indexing finishes. Try `/tome-add` and `/tome-search` with no arguments
too — both should prompt for what's missing rather than erroring or
guessing.

## Type-checking

```bash
npx tsc --noEmit
```

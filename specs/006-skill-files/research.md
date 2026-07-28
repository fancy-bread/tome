# Phase 0 Research: Skill Files

The spec's own checklist flagged one real ambiguity: this project's
reference material (`tdd.md`) sketches skill files as flat
`skills/tome-search.md` paths listed explicitly in `plugin.json`'s
`"skills"` array, while this very repo's installed Spec Kit skills use a
`.claude/skills/<name>/SKILL.md` directory convention. Both can't be
right for a distributable plugin, so this had to be verified against
Claude Code's actual current documentation before committing to a file
layout — not assumed from either piece of internal reference material.

## 1. Plugin skill file layout, naming, and namespacing

**Decision**: Each skill is a *directory* under a `skills/` folder at
the plugin root: `skills/tome-add/SKILL.md`,
`skills/tome-sources/SKILL.md`, `skills/tome-search/SKILL.md`.
`plugin.json` needs no explicit `"skills"` field — Claude Code
auto-discovers the `skills/` directory the same way it auto-discovers a
project's `.claude/skills/`. The folder name (or an explicit `name`
frontmatter field, which takes precedence and is what this milestone
uses to lock the invocation string against any future directory rename)
becomes the literal slash-command string with **no plugin-name colon
prefix** — unlike agents, which do get namespaced as
`plugin-name:agent-name`. So naming the folders exactly `tome-add`,
`tome-sources`, `tome-search` produces exactly `/tome-add`,
`/tome-sources`, `/tome-search`, matching spec.md's SC-001–SC-003
literal command strings.

**Rationale**: `tdd.md`'s flat-file sketch was written before real
Claude Code plugin documentation was consulted (this project's `CLAUDE.md`
explicitly separates "Tome the product" from "Claude Code the tool used
to build it" — this is a case where the product doc's early guess about
the tool's mechanism needed correcting against the tool itself, the same
category of correction as milestone 002's `pdf-parse` API discovery or
milestone 004's MCP SDK verification). Confirmed against Claude Code's
official plugins reference documentation
(`https://code.claude.com/docs/en/plugins-reference`), which states
skill folder names are used as invocation names directly, with no
automatic namespacing — namespacing was requested for skills in a
GitHub feature request but is not implemented.

**Alternatives considered**: This repo's own `.claude/skills/<name>/SKILL.md`
convention was initially assumed to be the same mechanism a
*distributed* plugin uses — it isn't identical in purpose (that's a
project-local convention, not the plugin-shipped one) but turned out to
match the plugin convention's shape closely enough to be a reasonable
starting guess, confirmed rather than replaced. `tdd.md`'s flat
`skills/*.md` sketch is superseded; `tdd.md` is not updated by this
plan (it lives in `specs/000-tome-core/`, outside this feature's scope),
but this decision is the authoritative one going forward, consistent
with how milestone 004's `data-model.md` already documented deviating
from `tdd.md`'s original sketch where the real mechanism required it.

## 2. Required and recommended frontmatter fields

**Decision**: Each `SKILL.md` declares:

```yaml
---
name: tome-add
description: <what this command does, shown in the slash-command menu>
argument-hint: <short hint text for expected arguments>
disable-model-invocation: true
---
```

`description` is the only field Claude Code strictly requires.
`name` is added anyway to lock the invocation string against a future
directory rename (belt-and-suspenders with the folder-name convention).
`argument-hint` is optional UX polish, included for all three since
each takes user-supplied input. `disable-model-invocation: true` is set
on all three deliberately — see the Constitution Check in plan.md for
why this is correct, not a gap: these commands are explicitly
human-invoked per the PRD, not another autonomous-invocation surface
alongside `tome_search`/`tome_fetch`.

**Rationale**: Matches the actual Claude Code plugin skill schema
(confirmed against the same plugins reference documentation), and
directly encodes spec.md's Assumptions section's requirement that these
three commands remain human-triggered.

**Alternatives considered**: Omitting `disable-model-invocation`
(leaving skills model-invocable by default) — rejected; it would let
the model invoke e.g. `/tome-add` on its own initiative, duplicating and
potentially conflicting with the model's already-correct path of calling
`tome_add_source` directly when it decides indexing is needed, which is
not how the PRD frames source-adding ("Human — deciding what to index is
inherently a human call").

## 3. Body content and argument handling

**Decision**: Each `SKILL.md` body follows the same shape already used
by this repo's own installed Spec Kit skills — a `## User Input` section
containing the literal `$ARGUMENTS` placeholder, followed by prose
instructing the agent exactly which MCP tool to call and how to map
`$ARGUMENTS` onto that tool's parameters, plus explicit instructions for
the two argument-handling edge cases spec.md names: a missing/malformed
required argument (ask the user, don't guess) and an underlying tool
call that fails (surface the error readably, don't swallow or crash).

**Rationale**: `$ARGUMENTS` is Claude Code's existing, already-proven
mechanism in this exact repo for passing slash-command input into a
skill's body — reusing it needs no new research and stays consistent
with tooling the team already relies on daily.

**Alternatives considered**: A structured argument schema (like the MCP
tools' Zod input schemas) for skill files — not a mechanism Claude Code
skills currently expose; skills receive raw trailing text via
`$ARGUMENTS`, so argument parsing/validation is necessarily prose
instruction to the agent, not a declared schema.

## 4. How this milestone gets manually tested before plugin.json exists

**Decision**: `claude --plugin-dir <path-to-this-repo>` loads a plugin
directory directly, including auto-discovering `skills/*/SKILL.md`,
with **no `.claude-plugin/plugin.json` required** — confirmed against
Claude Code's own documentation and quickstart, which states the
manifest is optional and used only for metadata display in the plugin
manager, not as a prerequisite for `--plugin-dir` to load skills. Changes
are picked up via `/reload-plugins` without restarting the session.

**Rationale**: This means milestone 006 does not need to borrow any of
milestone 007's scope (writing `plugin.json`) just to be manually
testable — the two milestones stay genuinely independent, matching
spec.md's Assumptions section.

**Alternatives considered**: Writing a minimal placeholder
`plugin.json` in this milestone just to enable manual testing —
rejected once `--plugin-dir`'s manifest-optional behavior was confirmed;
doing so anyway would have been unnecessary scope bleed into milestone
007 per Constitution Principle V.

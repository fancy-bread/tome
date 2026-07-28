# CLAUDE.md

Full contributor/agent guidance lives in [AGENTS.md](AGENTS.md) — read that
first. This file only covers what's specific to working in Claude Code on
this repo.

## Two senses of "Claude Code" here

Don't conflate them:

- **Tome the product** is a Claude Code plugin being built — it will
  register its own MCP server and skill commands (`/tome:add`,
  `/tome:sources`, `/tome:search`) for end users once implemented.
- **Claude Code the tool** is also what's used to *build* Tome, via the
  Spec Kit skills installed in this repo (see below). The tool-quality
  principle in the constitution (Principle III) is about the former, not
  this file.

## Spec Kit skills installed in this repo

This repo uses Spec Kit for the spec-first workflow described in
AGENTS.md. The relevant slash commands, in the order a feature typically
moves through them:

- `/speckit-constitution` — amend the project constitution
- `/speckit-specify` — draft `spec.md` for a new feature
- `/speckit-clarify` — resolve ambiguities in a spec before planning
- `/speckit-plan` — produce `plan.md`, including the Constitution Check gate
- `/speckit-tasks` — produce `tasks.md`
- `/speckit-analyze` — cross-check spec/plan/tasks for consistency
- `/speckit-checklist` — generate a review checklist for a feature
- `/speckit-implement` — execute `tasks.md`
- `/speckit-converge` — reconcile the codebase against spec/plan/tasks and
  backfill any missing tasks
- `/speckit-taskstoissues` — turn tasks into GitHub issues

Use these rather than freeform planning when starting or advancing a
feature — they keep the artifact trail (`specs/[###-feature]/`) consistent
with what `/speckit-analyze` and the Constitution Check expect.

## Binding reference

`.specify/memory/constitution.md` is the authoritative source for
non-negotiable design constraints (local-first, graceful degradation,
interface segregation, v1 scope discipline, tool-description quality).
When in doubt, defer to it over anything summarized in AGENTS.md or here.

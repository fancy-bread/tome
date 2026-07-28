# Phase 1 Data Model: Skill Files

No new persisted entities (per spec.md's Key Entities section — this
milestone introduces no new data, only three human-facing entry points
onto milestone 004's existing `tome_add_source`, `tome_list_sources`,
and `tome_search` MCP tools). What follows is the shape of the three new
*content files* themselves — not data the running system stores or
manipulates, but structure the validation tests in `tests/skills/`
check for.

## `SKILL.md` (one instance each: `add`, `sources`, `search`)

| Field | Location | Required | Notes |
|---|---|---|---|
| `name` | frontmatter | Yes (this project) | Locks the invocation string; must exactly match the folder name (research.md #1/#2). |
| `description` | frontmatter | Yes (Claude Code) | Shown in the slash-command menu. |
| `argument-hint` | frontmatter | Recommended | Short hint text; all three skills take user-supplied input. |
| `disable-model-invocation` | frontmatter | Yes, `true` (this project) | Prevents the model from invoking the skill autonomously — see plan.md's Constitution Check. |
| Body — `$ARGUMENTS` placeholder | body | Yes | Where the user's trailing input is substituted. |
| Body — target MCP tool instruction | body | Yes | Names the exact MCP tool (`tome_add_source` / `tome_list_sources` / `tome_search`) the agent must call. |
| Body — missing/malformed-argument instruction | body | Yes for `add`, `search` (FR-006/FR-007) | Tells the agent to ask the user, not guess. `sources` takes no arguments, so this doesn't apply to it. |
| Body — tool-failure instruction | body | Yes (FR-009) | Tells the agent to surface an underlying tool error readably. |

## Per-skill mapping to its MCP tool

| Skill | MCP Tool | User-supplied input | Notes |
|---|---|---|---|
| `add` | `tome_add_source` | source type, origin | FR-002 |
| `sources` | `tome_list_sources` | none | FR-003 |
| `search` | `tome_search` | query (optional limit/source scoping) | FR-004 |

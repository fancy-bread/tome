// Contract describing the frontmatter shape every skills/*/SKILL.md
// must satisfy. Not a runtime type — no src/ code parses these files
// (they're consumed directly by the Claude Code host, not by Tome's own
// process) — this exists purely so tests/skills/skill-files.test.ts has
// a single documented shape to validate each file against.
//
// See specs/006-skill-files/research.md #1-#2 for why these specific
// fields are required, and data-model.md for the full field table
// including body-content requirements this type can't express.

export interface SkillFrontmatter {
  /** Must exactly match the skill's folder name (research.md #1). */
  name: string;
  /** Shown in the slash-command menu. Claude Code's only strictly
   * required field. */
  description: string;
  /** Optional UX polish; all three of this milestone's skills set it
   * since all take user-supplied input. */
  'argument-hint'?: string;
  /** Must be `true` for all three of this milestone's skills — see
   * plan.md's Constitution Check for why. */
  'disable-model-invocation': true;
}

/**
 * Every skill's body must, at minimum, contain:
 * - The literal `$ARGUMENTS` placeholder, so the user's trailing input
 *   reaches the agent.
 * - The exact name of the MCP tool this skill maps to (see
 *   data-model.md's per-skill mapping table).
 * - An instruction to ask the user for clarification on a missing or
 *   malformed required argument, for tome-add and tome-search (FR-006,
 *   FR-007) — not applicable to tome-sources, which takes no arguments.
 * - An instruction to surface an underlying MCP tool failure readably
 *   rather than silently (FR-009).
 *
 * Expressed here as documentation only — body content is prose, not a
 * typed structure, so the test suite checks for these via substring/
 * pattern assertions against the parsed body text, not a parsed object.
 */
export type SkillBodyRequirement =
  | 'contains-arguments-placeholder'
  | 'names-target-mcp-tool'
  | 'instructs-clarify-on-missing-argument'
  | 'instructs-surface-tool-failure';

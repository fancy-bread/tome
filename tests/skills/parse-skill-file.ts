// Test-only helper for validating skills/*/SKILL.md structure. No src/
// code parses these files — they're consumed directly by the Claude
// Code host, not by Tome's own process (see
// specs/006-skill-files/contracts/skill-file.ts).

import { readFileSync } from 'node:fs';

export interface ParsedSkillFile {
  frontmatter: Record<string, string>;
  body: string;
}

/**
 * Splits a SKILL.md file into its frontmatter (the flat scalar keys
 * between the first two `---` lines) and body. Deliberately not a YAML
 * parser — nothing nested or list-shaped is used by this project's
 * skill files (research.md #2).
 */
export function parseSkillFile(path: string): ParsedSkillFile {
  const raw = readFileSync(path, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!match) {
    throw new Error(`${path} does not start with a --- frontmatter block`);
  }
  const [, frontmatterBlock, body] = match;

  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterBlock.split('\n')) {
    if (!line.trim()) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

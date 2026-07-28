import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSkillFile } from './parse-skill-file.js';

const SKILLS_DIR = join(import.meta.dirname, '..', '..', 'skills');

describe('skills/add/SKILL.md', () => {
  const { frontmatter, body } = parseSkillFile(join(SKILLS_DIR, 'add', 'SKILL.md'));

  it('has correct frontmatter', () => {
    expect(frontmatter.name).toBe('add');
    expect(frontmatter.description).toBeTruthy();
    expect(frontmatter['disable-model-invocation']).toBe('true');
  });

  it('contains the arguments placeholder and targets tome_add_source', () => {
    expect(body).toContain('$ARGUMENTS');
    expect(body).toContain('tome_add_source');
  });

  it('instructs asking for clarification on a missing or invalid argument', () => {
    expect(body).toMatch(/ask.*clarify|clarify.*ask/is);
  });

  it('instructs surfacing a failed tool call readably (FR-009)', () => {
    expect(body.toLowerCase()).toContain('fail');
  });
});

describe('skills/sources/SKILL.md', () => {
  const { frontmatter, body } = parseSkillFile(join(SKILLS_DIR, 'sources', 'SKILL.md'));

  it('has correct frontmatter', () => {
    expect(frontmatter.name).toBe('sources');
    expect(frontmatter.description).toBeTruthy();
    expect(frontmatter['disable-model-invocation']).toBe('true');
  });

  it('targets tome_list_sources', () => {
    expect(body).toContain('tome_list_sources');
  });

  it('instructs reporting nothing indexed yet, not an error, when the source list is empty', () => {
    expect(body.toLowerCase()).toMatch(/nothing.*indexed/);
    expect(body.toLowerCase()).toContain('not an error');
  });

  it('instructs surfacing a failed tool call readably (FR-009)', () => {
    expect(body.toLowerCase()).toContain('fail');
  });
});

describe('skills/search/SKILL.md', () => {
  const { frontmatter, body } = parseSkillFile(join(SKILLS_DIR, 'search', 'SKILL.md'));

  it('has correct frontmatter', () => {
    expect(frontmatter.name).toBe('search');
    expect(frontmatter.description).toBeTruthy();
    expect(frontmatter['disable-model-invocation']).toBe('true');
  });

  it('contains the arguments placeholder and targets tome_search', () => {
    expect(body).toContain('$ARGUMENTS');
    expect(body).toContain('tome_search');
  });

  it('instructs asking for a query when none is given', () => {
    expect(body.toLowerCase()).toMatch(/ask.*(search|query)/s);
  });

  it('instructs reporting no results, not an error, when nothing matches', () => {
    expect(body.toLowerCase()).toContain('no results');
    expect(body.toLowerCase()).toContain('not an error');
  });

  it('instructs surfacing a failed tool call readably (FR-009)', () => {
    expect(body.toLowerCase()).toContain('fail');
  });
});

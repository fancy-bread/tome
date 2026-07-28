import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDbPath } from '../../src/index.js';

describe('resolveDbPath', () => {
  it('uses CLAUDE_PLUGIN_DATA when set', () => {
    expect(resolveDbPath({ CLAUDE_PLUGIN_DATA: '/custom/data/dir' })).toBe(
      join('/custom/data/dir', 'index.db'),
    );
  });

  it('falls back to a fixed default when CLAUDE_PLUGIN_DATA is unset', () => {
    expect(resolveDbPath({})).toBe(join(homedir(), '.claude', 'plugins', 'tome', 'index.db'));
  });
});

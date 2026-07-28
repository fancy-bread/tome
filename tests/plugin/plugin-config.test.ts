import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOME_ADD_SOURCE,
  TOME_FETCH,
  TOME_LIST_SOURCES,
  TOME_SEARCH,
} from '../../src/mcp/tool-descriptions.js';

// Mirrors specs/007-plugin-packaging/contracts/plugin-packaging.ts's
// EXPECTED/type shapes. Not imported directly — specs/ is outside
// tsconfig's include set (src, tests only), the same boundary that kept
// milestone 006's contracts/skill-file.ts documentation-only rather
// than an importable module.
const EXPECTED = {
  pluginName: 'tome',
  mcpServerName: 'tome',
  mcpArgsPlaceholder: '${CLAUDE_PLUGIN_ROOT}/dist/index.js',
  dataDirEnvVar: 'CLAUDE_PLUGIN_DATA',
  dataDirEnvPlaceholder: '${CLAUDE_PLUGIN_DATA}',
} as const;

interface PluginManifest {
  name: string;
  description: string;
}

interface McpConfig {
  mcpServers: Record<
    string,
    { type: string; command: string; args: string[]; env?: Record<string, string> }
  >;
}

interface HooksConfig {
  hooks: { SessionStart?: Array<{ type: string; command: string; async?: boolean }> };
}

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('.claude-plugin/plugin.json', () => {
  const manifest = readJson<PluginManifest>(join(REPO_ROOT, '.claude-plugin', 'plugin.json'));

  it('has the expected name and a non-empty description', () => {
    expect(manifest.name).toBe(EXPECTED.pluginName);
    expect(manifest.description).toBeTruthy();
  });
});

describe('.mcp.json', () => {
  const config = readJson<McpConfig>(join(REPO_ROOT, '.mcp.json'));

  it('declares the tome server correctly', () => {
    const server = config.mcpServers[EXPECTED.mcpServerName];
    expect(server).toBeDefined();
    expect(server.type).toBe('stdio');
    expect(server.command).toBe('node');
    expect(server.args).toContain(EXPECTED.mcpArgsPlaceholder);
    expect(server.env?.[EXPECTED.dataDirEnvVar]).toBe(EXPECTED.dataDirEnvPlaceholder);
  });
});

describe('hooks/hooks.json', () => {
  const config = readJson<HooksConfig>(join(REPO_ROOT, 'hooks', 'hooks.json'));

  it('declares an async SessionStart build hook, guarded by an idempotency check', () => {
    const entries = config.hooks.SessionStart;
    expect(entries).toHaveLength(1);
    const [entry] = entries!;
    expect(entry.type).toBe('command');
    expect(entry.command).toContain('npm install');
    expect(entry.command).toContain('npm run build');
    expect(entry.command).toMatch(/\[ -f .* \] \|\|/); // idempotency guard
    expect(entry.async).toBe(true);
  });
});

describe('FR-002/SC-001 proxy: every ingredient exists, independent of a live session', () => {
  it('declares exactly the four expected MCP tools, correctly named', () => {
    const names = [TOME_SEARCH, TOME_FETCH, TOME_LIST_SOURCES, TOME_ADD_SOURCE].map((t) => t.name);
    expect(names.sort()).toEqual(
      ['tome_search', 'tome_fetch', 'tome_list_sources', 'tome_add_source'].sort(),
    );
  });

  it('declares exactly three skill directories, correctly named', () => {
    const skillDirs = readdirSync(join(REPO_ROOT, 'skills'));
    expect(skillDirs.sort()).toEqual(['add', 'sources', 'search'].sort());
  });
});

describe('README.md Troubleshooting content (FR-007)', () => {
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');

  it('tells the user to run claude --debug to diagnose a startup failure', () => {
    expect(readme).toContain('claude --debug');
  });
});

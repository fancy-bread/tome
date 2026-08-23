import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOME_ADD_SOURCE,
  TOME_FETCH,
  TOME_LIST_SOURCES,
  TOME_REMOVE_SOURCE,
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
  marketplaceName: 'tome',
  marketplacePluginSource: './',
} as const;

interface PluginManifest {
  name: string;
  description: string;
}

interface MarketplaceConfig {
  name: string;
  owner: { name: string };
  plugins: Array<{ name: string; source: string }>;
}

interface McpConfig {
  mcpServers: Record<
    string,
    { type: string; command: string; args: string[]; env?: Record<string, string> }
  >;
}

interface HooksConfig {
  hooks: {
    SessionStart?: Array<{
      hooks: Array<{ type: string; command: string; async?: boolean }>;
    }>;
  };
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

describe('.claude-plugin/marketplace.json (FR-005, corrected post-release)', () => {
  const marketplace = readJson<MarketplaceConfig>(join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));

  it('declares this repo as its own marketplace, listing the tome plugin', () => {
    expect(marketplace.name).toBe(EXPECTED.marketplaceName);
    expect(marketplace.owner?.name).toBeTruthy();
    const entry = marketplace.plugins.find((p) => p.name === EXPECTED.pluginName);
    expect(entry).toBeDefined();
    expect(entry!.source).toBe(EXPECTED.marketplacePluginSource);
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
    const matchers = config.hooks.SessionStart;
    expect(matchers).toHaveLength(1);
    // Each matcher entry wraps its actual command(s) in a nested `hooks`
    // array — a schema requirement confirmed empirically via `claude
    // plugin details`, which reported "failed to load" until this
    // nesting was added (research.md #5's Correction — a second real
    // bug found by that same verification pass).
    const entries = matchers![0].hooks;
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.type).toBe('command');
    expect(entry.command).toContain('npm install');
    expect(entry.command).toContain('npm run build');
    expect(entry.command).toMatch(/\[ -f .* \] \|\|/); // idempotency guard
    expect(entry.async).toBe(true);
  });
});

describe('FR-002/SC-001 proxy: every ingredient exists, independent of a live session', () => {
  it('declares exactly the five expected MCP tools, correctly named', () => {
    const names = [TOME_SEARCH, TOME_FETCH, TOME_LIST_SOURCES, TOME_ADD_SOURCE, TOME_REMOVE_SOURCE].map(
      (t) => t.name,
    );
    expect(names.sort()).toEqual(
      ['tome_search', 'tome_fetch', 'tome_list_sources', 'tome_add_source', 'tome_remove_source'].sort(),
    );
  });

  it('declares exactly four skill directories, correctly named', () => {
    const skillDirs = readdirSync(join(REPO_ROOT, 'skills'));
    expect(skillDirs.sort()).toEqual(['add', 'sources', 'search', 'remove'].sort());
  });
});

describe('README.md Troubleshooting content (FR-007)', () => {
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');

  it('tells the user to run claude --debug to diagnose a startup failure', () => {
    expect(readme).toContain('claude --debug');
  });
});

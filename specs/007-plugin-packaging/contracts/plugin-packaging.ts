// Contract describing the shape of the three new plugin configuration
// files. Not runtime types — no src/ code parses these files (Claude
// Code itself does); this exists purely as a documented shape to
// validate each file's parsed JSON against.
//
// Not imported directly by tests/plugin/plugin-config.test.ts — specs/
// is outside tsconfig's include set (src, tests only), so that test
// mirrors these shapes/constants inline instead, the same boundary
// that kept milestone 006's contracts/skill-file.ts documentation-only.
//
// See specs/007-plugin-packaging/research.md #1-#3 for why these
// specific fields and values are required, and data-model.md for the
// full field table.

export interface PluginManifest {
  name: string;
  description: string;
  version?: string;
  author?: { name: string };
}

export interface StdioMcpServerConfig {
  type: 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, StdioMcpServerConfig>;
}

export interface CommandHookEntry {
  type: 'command';
  command: string;
  async?: boolean;
  statusMessage?: string;
}

export interface HooksConfig {
  hooks: {
    SessionStart?: CommandHookEntry[];
    [event: string]: CommandHookEntry[] | undefined;
  };
}

/**
 * Added post-release (research.md #5's Correction): a marketplace is
 * always required for a persistent install, even self-hosted in the
 * same repo as the plugin.
 */
export interface MarketplaceConfig {
  name: string;
  owner: { name: string };
  plugins: Array<{ name: string; source: string }>;
}

/**
 * Fixed values this project's config files must contain — asserted by
 * tests/plugin/plugin-config.test.ts, not just typed here.
 */
export const EXPECTED = {
  pluginName: 'tome',
  mcpServerName: 'tome',
  mcpArgsPlaceholder: '${CLAUDE_PLUGIN_ROOT}/dist/index.js',
  dataDirEnvVar: 'CLAUDE_PLUGIN_DATA',
  dataDirEnvPlaceholder: '${CLAUDE_PLUGIN_DATA}',
  marketplaceName: 'tome',
  marketplacePluginSource: './',
} as const;

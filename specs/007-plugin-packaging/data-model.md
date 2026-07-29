# Phase 1 Data Model: Claude Code Plugin Packaging

No new persisted entities (per spec.md's Key Entities section). What
follows is the shape of the three new configuration files, and the one
corrected field in an existing runtime concept — not data the running
system stores or manipulates, but structure a test can validate.

## `.claude-plugin/plugin.json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | Yes | `"tome"` — also the skill-command namespace prefix (research.md #4). |
| `description` | `string` | Yes | Shown in Claude Code's plugin manager (FR-006). |
| `version` | `string` | Recommended | Semantic version; if omitted, git commit SHA is used per-install instead (not this project's choice for v1 — an explicit version is clearer for a hand-installed git plugin). |
| `author` | `{ name: string }` | Optional | Attribution. |

## `.mcp.json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `mcpServers` | `Record<string, StdioServerConfig>` | Yes | Keyed by server name (`"tome"`), not an array (research.md #1 — corrects `tdd.md`'s sketch). |
| `mcpServers.tome.type` | `"stdio"` | Yes | The only transport this project uses (milestone 004). |
| `mcpServers.tome.command` | `string` | Yes | `"node"`. |
| `mcpServers.tome.args` | `string[]` | Yes | `["${CLAUDE_PLUGIN_ROOT}/dist/index.js"]` — must use the placeholder, not a relative path (research.md #1). |
| `mcpServers.tome.env` | `Record<string, string>` | Yes (for this project) | `{ "CLAUDE_PLUGIN_DATA": "${CLAUDE_PLUGIN_DATA}" }` — required to forward the variable into the subprocess at all (research.md #3). |

## `hooks/hooks.json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `hooks.SessionStart` | `HookEntry[]` | Yes | One entry, the build step. |
| `...command.type` | `"command"` | Yes | |
| `...command.command` | `string` | Yes | An idempotent shell one-liner (research.md #2): skip if `dist/index.js` already exists, else `cd "${CLAUDE_PLUGIN_ROOT}" && npm install && npm run build`. |
| `...command.async` | `true` | Yes (for this project) | Prevents blocking session startup on first run (research.md #2). |
| `...command.statusMessage` | `string` | Optional | UX polish shown during the async run. |

## `.claude-plugin/marketplace.json` (new, added post-release — research.md #5's Correction)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | Yes | Marketplace ID, `"tome"`. |
| `owner` | `{ name: string }` | Yes | Maintainer info. |
| `plugins` | `Array<{ name: string; source: string \| object }>` | Yes | One entry: `{ "name": "tome", "source": "./" }` — `"./"` resolves relative to the marketplace root, correct here since this repo is both the plugin and its own marketplace listing. |

## `README.md`'s Troubleshooting section (new content, added post-planning)

| Requirement | Notes |
|---|---|
| Mentions `claude --debug` | The only way Claude Code surfaces an MCP server startup failure — it does not display one proactively (research.md #6, added during `/speckit-analyze`, not the original Phase 1 design). Satisfies FR-007/SC-004's revised, achievable scope: a documented troubleshooting step, not a platform guarantee. |

## `src/index.ts`'s `resolveDbPath` (existing, one field corrected)

| Before this milestone | After this milestone |
|---|---|
| Reads `env.CLAUDE_PLUGIN_DATA_DIR` — a name that does not exist in the real Claude Code harness (research.md #3). | Reads `env.CLAUDE_PLUGIN_DATA` — the real variable name, now actually reachable once `.mcp.json`'s `env` field forwards it. |

No other change to `resolveDbPath`'s logic — the fixed-default fallback
behavior when the variable is unset is unchanged and was already
correctly tested; only the variable name being checked was wrong.

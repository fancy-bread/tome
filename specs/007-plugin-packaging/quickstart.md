# Quickstart: Claude Code Plugin Packaging

Validates that the plugin configuration files are structurally correct,
that the corrected `CLAUDE_PLUGIN_DATA` environment variable actually
works, and — for a real sanity check — that the packaged plugin
actually installs and runs in a live Claude Code session.

## Prerequisites

- No new dependency (research.md — all three new files are plain JSON).
- For the manual test only: a working Claude Code CLI install.

## What gets validated (automated)

```
tests/plugin/
└── plugin-config.test.ts   # structural validation of plugin.json, .mcp.json, hooks.json

tests/mcp/
└── index.test.ts            # resolveDbPath, updated for CLAUDE_PLUGIN_DATA
```

## Run it

```bash
npm test
```

## Expected outcome (automated)

- **FR-001/FR-006** — `plugin-config.test.ts`: `.claude-plugin/plugin.json`
  parses as JSON and has `name: "tome"` and a non-empty `description`.
- **FR-001** — `plugin-config.test.ts`: `.mcp.json` declares a `tome`
  server under `mcpServers`, with `type: "stdio"`, `command: "node"`,
  `args` containing `${CLAUDE_PLUGIN_ROOT}/dist/index.js`, and an `env`
  entry forwarding `CLAUDE_PLUGIN_DATA`.
- **FR-003** — `plugin-config.test.ts`: `hooks/hooks.json` declares a
  `SessionStart` hook whose command contains both `npm install` and
  `npm run build`, guarded by an idempotency check, and is marked
  `async: true`.
- **FR-004** — `tests/mcp/index.test.ts`: `resolveDbPath` reads
  `CLAUDE_PLUGIN_DATA` (not the old, incorrect `CLAUDE_PLUGIN_DATA_DIR`)
  and falls back to the fixed default when unset.
- **FR-002/SC-001 (proxy)** — `plugin-config.test.ts`: the four MCP tool
  names and three skill directories are all present and correctly
  named, independent of whether the manual smoke test below is run.
- **FR-007** — `plugin-config.test.ts`: `README.md` contains
  troubleshooting guidance mentioning `claude --debug` — the documented
  workaround for SC-004, since Claude Code doesn't proactively surface
  an MCP server startup failure (research.md #6).
- **FR-005 (corrected post-release)** — `plugin-config.test.ts`:
  `.claude-plugin/marketplace.json` parses and declares this repo as
  its own marketplace, listing the `tome` plugin with `source: "./"`
  (research.md #5's Correction).

Structural/content checks are the ceiling of what's automatable here —
whether the real Claude Code harness actually runs the hook, injects the
variables, and starts the server correctly is a live-session concern,
the same limitation milestone 006 accepted for its skill files.

## Manual smoke test (real Claude Code session)

**Corrected post-release (research.md #5)**: `claude plugin install
<git-url>` has no direct-install form — install always goes through a
marketplace, even a self-hosted one. To actually prove FR-005/SC-001 —
not just `--plugin-dir` session-scoped loading — run the real install
flow:

```bash
claude plugin marketplace add fancy-bread/tome
claude plugin install tome@fancy-bread/tome
```

(Or fully local, no GitHub: `claude plugin marketplace add
/path/to/tome` then `claude plugin install tome@tome`.) Confirm the
install succeeds and persists to a *new* session — `--plugin-dir`
below only proves loading works, not that the marketplace-mediated
install path itself works.

For faster dev-loop iteration on the config files themselves,
`--plugin-dir` remains useful and doesn't need a marketplace at all:

```bash
claude --plugin-dir /path/to/tome
```

Inside that session:

```
/reload-plugins
/tome:add path /path/to/some/local/docs
/tome:sources
/tome:search some query relevant to what you just added
```

Expected: all three commands work exactly as they did in milestone
006's manual test, but this time the MCP server was started via
`.mcp.json` (not a hand-run `node dist/index.js`), and — if `dist/`
didn't already exist — the `SessionStart` hook's build ran first
(watch for the `statusMessage` during that first run).

To verify FR-004/SC-002 specifically: after adding a source, close the
session (`Ctrl-D` or exit) and start a new one with the same
`--plugin-dir`. Run `/tome:sources` again — the previously added source
should still be listed without re-adding it, confirming the index
persisted in the real `CLAUDE_PLUGIN_DATA` directory rather than a
location that got cleared between sessions.

To verify SC-004/FR-007 specifically: temporarily break `.mcp.json`
(e.g. change `"command": "node"` to `"command": "node-typo"`), run
`/reload-plugins`, and confirm the MCP tools silently disappear with no
visible error in the session itself — then run `claude --debug` and
confirm the initialization failure *is* visible there. This proves the
documented troubleshooting step in `README.md` actually leads somewhere
real, not just that it exists as text. Revert `.mcp.json` afterward.

## Type-checking

```bash
npx tsc --noEmit
```

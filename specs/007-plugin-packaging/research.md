# Phase 0 Research: Claude Code Plugin Packaging

Both technical unknowns spec.md's Assumptions flagged were verified
against Claude Code's official documentation this milestone — first via
the `claude-code-guide` subagent, then, after milestone 006's namespacing
claim from that same subagent turned out to be wrong (see #4 below),
cross-checked with a direct fetch of
`https://code.claude.com/docs/en/plugins` for anything foundational.

## 1. Manifest file and MCP server declaration

**Decision**: The plugin manifest lives at `.claude-plugin/plugin.json`
and contains only identity metadata:

```json
{
  "name": "tome",
  "description": "Local-first documentation indexing for Claude Code",
  "version": "0.1.0",
  "author": { "name": "Fancy Bread" }
}
```

The MCP server is declared in a **separate** `.mcp.json` at the plugin
root — not inside `plugin.json` at all:

```json
{
  "mcpServers": {
    "tome": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"],
      "env": { "CLAUDE_PLUGIN_DATA": "${CLAUDE_PLUGIN_DATA}" }
    }
  }
}
```

`mcpServers` is an object keyed by server name, not an array —
`tdd.md`'s sketch had both the file location and the array shape wrong.
`args` must use the `${CLAUDE_PLUGIN_ROOT}` placeholder, not a relative
`./dist/index.js` — the installed plugin's working directory is not
guaranteed to be the plugin's own root, so an unqualified relative path
would resolve against the wrong directory.

**Rationale**: Confirmed directly against
`https://code.claude.com/docs/en/plugins-reference` (MCP server
schema) and `https://code.claude.com/docs/en/mcp.md` (path placeholder
substitution rules, applying to `command`, `args`, and `env` for `stdio`
servers).

**Alternatives considered**: `tdd.md`'s original single-`plugin.json`
sketch (`mcpServers` as an array inside the manifest) — superseded; kept
as a historical record in `specs/000-tome-core/tdd.md`, not edited,
consistent with how milestone 004's `data-model.md` handled a similar
`tdd.md` deviation.

## 2. Build step and native dependencies

**Decision**: `claude plugin install` copies the plugin's files with no
`npm install` or build step — confirmed directly against the docs, not
assumed. Because `better-sqlite3` and `sqlite-vec` are native/compiled
addons, neither committing `dist/` alone nor committing `node_modules/`
is viable (a native binary built on one OS/architecture won't run on
another). A `hooks/hooks.json` `SessionStart` hook runs the build on the
installing user's own machine, the same way `npm install` already
compiles these packages correctly today for any other consumer of this
repository:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "[ -f \"${CLAUDE_PLUGIN_ROOT}/dist/index.js\" ] || (cd \"${CLAUDE_PLUGIN_ROOT}\" && npm install && npm run build)",
        "async": true,
        "statusMessage": "Setting up Tome..."
      }
    ]
  }
}
```

`async: true` prevents this from blocking session startup on the first
run, when the native compilation genuinely takes real time.

**Rationale**: No documented alternative exists for shipping native
dependencies in a plugin (confirmed — the subagent was explicit that
this exact scenario isn't addressed anywhere in the docs beyond the
general "no auto npm install" finding, and reasoned to the
`SessionStart` hook as the only mechanism that actually solves it: it
compiles for the *installing* machine's real platform, which a
pre-built artifact of any kind cannot).

**Alternatives considered**: Committing a pre-built `dist/` with
`node_modules` vendored — rejected, not portable across platforms.
Requiring the user to manually run `npm install && npm run build` after
installing — rejected, directly violates FR-003. A hash-diff idempotency
check comparing `package.json` across runs (shown as an option in
Claude Code's own docs) — considered and deferred; a simple
`dist/index.js` existence check is sufficient for v1 (Constitution
Principle V) and documented here as an accepted simplification: a
dependency bump without a version bump could theoretically leave a
stale build, a known, accepted v1 gap, not a silent one.

## 3. `CLAUDE_PLUGIN_DATA` — a real bug in already-shipped code

**Decision**: The Claude Code environment variable is `CLAUDE_PLUGIN_DATA`
(no `_DIR` suffix). `src/index.ts` (milestone 004) reads
`process.env.CLAUDE_PLUGIN_DATA_DIR`, a name that does not exist in the
real harness. As shipped, an installed Tome would always fail that
check and silently fall through to the fixed default path — meaning
FR-004 (durable, per-plugin data directory) would never actually engage
in production, despite `resolveDbPath`'s tests passing (they test the
function's own if/else logic correctly, just against the wrong
variable name).

**Rationale**: Verified with a targeted, skeptical follow-up question
specifically because renaming a variable in already-tested code is a
consequential claim — confirmed against
`https://code.claude.com/docs/en/plugins-reference`'s environment
variable table, which lists `${CLAUDE_PLUGIN_DATA}` explicitly, and
against the same variable name being used for direct `process.env`
access in a running server (not only for `.mcp.json` template
substitution — both are confirmed to be the same literal string).
`.mcp.json`'s `env` field must also forward it explicitly
(`"CLAUDE_PLUGIN_DATA": "${CLAUDE_PLUGIN_DATA}"`, decision #1) — it is
**not** present in the subprocess's environment automatically; the
variable only participates in `${}` template substitution within
`.mcp.json` itself.

**Alternatives considered**: None — this is a factual correction, not a
design choice with trade-offs. `src/index.ts`'s `resolveDbPath` function
and its test in `tests/mcp/index.test.ts` both need the variable name
corrected; the function's fallback-default behavior is otherwise
unchanged and still correct.

## 4. Skill command namespacing — a correction to milestone 006's research

**Decision**: Plugin skills are **always** namespaced as
`plugin-name:skill-name` — there is no way to get a bare, unprefixed
command. This directly contradicts milestone 006's own `research.md`
decision #1, which claimed (based on a subagent answer, not a direct
doc read) that skills, unlike agents, are not namespaced. That claim was
wrong. Caught this milestone by fetching
`https://code.claude.com/docs/en/plugins` directly instead of relaying
through another subagent round-trip, after a user prompt to check that
specific URL. The doc states, in three separate places, that "Plugin
skills are always namespaced (like `/plugin-name:hello`)."

**Consequence and fix**: Milestone 006's skill folders were originally
named `tome-add`, `tome-sources`, `tome-search` — since this plugin's
own name is `tome`, that would have produced the redundant
`/tome:tome-add`, `/tome:tome-sources`, `/tome:tome-search`. The folders
were renamed to `add`, `sources`, `search` (and each `SKILL.md`'s `name`
frontmatter and body text updated to match), producing the clean
`/tome:add`, `/tome:sources`, `/tome:search`. `specs/006-skill-files/`'s
`spec.md`, `research.md`, `plan.md`, `data-model.md`, `quickstart.md`,
and `tasks.md` were all updated in place to reflect this, plus
`README.md`, `CLAUDE.md`, and `tests/skills/skill-files.test.ts`. See
`specs/006-skill-files/research.md` decision #1's own inline Correction
note for the full before/after record.

**Rationale for fixing now rather than leaving it**: This milestone's
own quickstart (below) is the first place these commands actually get
manually exercised under a real plugin install; shipping the wrong
invocation strings here would have been the first real-world discovery
of the bug, at a worse time than mid-planning.

**Alternatives considered**: Leaving `/tome:tome-add` etc. as shipped —
rejected as needlessly awkward for users when a clean fix was available
before anything was ever actually distributed.

## 5. Marketplace listing

**Decision**: Out of scope, confirmed — `claude plugin install
github://fancy-bread/tome` (git-based install) requires no
`marketplace.json`; that mechanism is entirely separate from and
additional to direct git installation, per both the PRD and the plugins
guide's own distribution section.

**Rationale**: Matches spec.md's Assumptions and Constitution Principle
V — no scope creep into a v2-shaped distribution concern.

**Alternatives considered**: None — already decided at the PRD level;
this research only confirms nothing about the manifest/MCP/hook design
above accidentally requires a marketplace registration as a side effect.

## 6. MCP server startup failure visibility — a correction to this plan's own Constitution Check

**Decision**: Claude Code does **not** proactively surface an MCP server
startup failure to the user by default. Per the official plugins
reference's debugging section, a server that fails to initialize is
silently skipped — diagnosable only by running `claude --debug`, which
shows initialization errors in the CLI output. This is a *different*
mechanism than LSP servers, whose failures do appear in the `/plugin`
manager's Errors tab — that precedent does not carry over to MCP
servers, and this milestone's plan originally assumed it might without
checking.

**Consequence and fix**: `plan.md`'s original Constitution Check
justified spec.md's SC-004 ("a failure is visible to the user") by
citing milestone 004's `withErrorHandling` pattern — but that pattern
only handles failures *inside* an already-running MCP protocol exchange,
not a process that never started at all. That justification didn't
actually address SC-004's scenario, and no research had verified
Claude Code's real behavior. Caught during `/speckit-analyze`, not
during the original research pass. spec.md's SC-004, its Edge Case, and
a new FR-007 were revised to match reality: the achievable guarantee is
that Tome's own documentation tells a user to run `claude --debug` when
expected tools/commands don't appear, not that Claude Code itself
displays an error — a platform behavior outside this milestone's
control, not a gap in Tome's own graceful-degradation handling.
`plan.md`'s Constitution Check is corrected to cite this finding instead
of the inapplicable `withErrorHandling` reference.

**Rationale**: Verified directly against
`https://code.claude.com/docs/en/plugins-reference`'s debugging and
development tools section, specifically the "servers that fail to
initialize" note and its `claude --debug` guidance — not inferred by
analogy from the LSP-server behavior, which turned out to be a
different code path.

**Alternatives considered**: Leaving SC-004 as originally written
(implying Claude Code proactively surfaces the failure) — rejected;
it would have been an unfulfillable requirement discovered only after
implementation, the same category of mistake this milestone's other two
corrections (env var name, skill namespacing) were caught to avoid.
Having Tome's own MCP server self-report a startup failure somehow —
not possible; if the process never starts, no Tome code ever runs to
report anything.

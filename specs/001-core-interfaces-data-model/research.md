# Phase 0 Research: Core Interfaces & Data Model

No `[NEEDS CLARIFICATION]` markers remained in Technical Context after
applying the constitution's Technology Constraints directly, but four
project-scaffolding decisions weren't pinned by the constitution and are
resolved here since this is the first feature to introduce source code.

## Node.js version baseline

**Decision**: Node.js 24 LTS as the minimum supported runtime.

**Rationale**: The constitution specifies "Node.js / TypeScript" but not a
version. 24 is the current Long-Term-Support line, has stable native ESM
support and `node:test` availability (even though we're not using the
latter — see below), and is what Claude Code's own plugin host is most
likely to have available. Pinning to a concrete LTS now avoids an
implicit, undocumented minimum creeping in later.

**Alternatives considered**: Node 20 LTS (still in support, but superseded
as the current LTS — rejected to avoid starting the project a generation
behind on day one); no pinned minimum (rejected — leaves `engines`
unspecified in `package.json`, silently inviting compatibility bugs in
later milestones).

## Module system

**Decision**: ESM (`"type": "module"` in `package.json`), `.ts` sources
compiled to `.js` via `tsc`.

**Rationale**: `@modelcontextprotocol/sdk` (introduced in milestone 004)
ships as ESM-first; starting the project on ESM avoids an interop
migration later. TypeScript's `NodeNext` module resolution handles this
cleanly for a Node-only target (no bundler needed).

**Alternatives considered**: CommonJS (rejected — would require dual-
package or interop shims once the MCP SDK is added in 004); a bundler
(esbuild/tsup) (rejected as unnecessary for a Node-only daemon with no
browser target — plain `tsc` output is sufficient).

## Testing framework

**Decision**: Vitest.

**Rationale**: Native TypeScript and ESM support with no transform
configuration, fast enough for the contract-test-suite-run-against-
multiple-implementations pattern this feature establishes (the same suite
will be re-run against `SqliteDocumentIndex` in milestone 003), and its
`describe`/`it` API needs no adaptation from the acceptance-scenario
structure already in spec.md.

**Alternatives considered**: Jest (rejected — ESM support requires extra
configuration that Vitest provides by default); Node's built-in
`node:test` (rejected — usable, but lacks Vitest's watch mode and
assertion ergonomics with no offsetting benefit here, since this isn't a
zero-dependency-constrained project).

## Contract-testing pattern

**Decision**: A single exported test-suite function,
`runDocumentIndexContractTests(makeIndex: () => DocumentIndex)`, defined
once in `tests/contract/document-index.contract.ts`. Milestone 001
calls it with an in-memory fake; milestone 003 will call the *same*
function with a factory that constructs `SqliteDocumentIndex`, with zero
changes to the suite itself.

**Rationale**: This is the direct, executable form of SC-003 ("the
contract is implementable by a second backend without any change to
callers — validated by substituting a test double"). Writing it as a
reusable function rather than a one-off test file makes that validation
automatic in 003 instead of something someone has to remember to redo.

**Alternatives considered**: Separate, hand-duplicated test files per
implementation (rejected — duplication drifts, and drift is exactly what
SC-003 is trying to catch); a formal contract-testing framework/library
(rejected — one shared function is sufficient at this scale; introducing
a dependency for it would be disproportionate).

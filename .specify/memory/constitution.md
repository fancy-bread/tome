<!--
Sync Impact Report
==================
Version change: TEMPLATE → 1.0.0 (initial ratification)
Modified principles: N/A (first population of template placeholders)
Added sections:
  - I. Local-First, Privacy-by-Default
  - II. Graceful Degradation Over Hard Failure
  - III. Autonomous-Tool-Quality as a Design Requirement
  - IV. Interface-Segregated Storage & Embedding
  - V. Minimal v1 Scope, Explicit Deferral
  - Technology Constraints (Section 2)
  - Development Workflow & Quality Gates (Section 3)
  - Governance
Removed sections: none (template placeholders only)
Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ no change needed (Constitution Check
    section is intentionally generic; gates are derived per-feature from this file)
  - .specify/templates/spec-template.md — ✅ no change needed (technology-agnostic
    by design; no constitution-specific references)
  - .specify/templates/tasks-template.md — ✅ no change needed (task categories
    are illustrative and already accommodate degradation/interface-boundary tasks)
  - .claude/skills/speckit-*/SKILL.md — ✅ reviewed, no outdated or
    agent-specific references found; all read the constitution generically
Follow-up TODOs: none
-->

# Tome Constitution

## Core Principles

### I. Local-First, Privacy-by-Default

Tome MUST NOT transmit indexed content or crawled documentation off the user's
device unless the user has explicitly configured a non-local embedder or
storage backend. The v1 embedding path (Ollama, `nomic-embed-text`) and
storage path (SQLite on local disk) MUST work fully offline, with no account,
API key, or network call required to install, index, or search. Any future
API-based embedder or remote index is opt-in and additive, never a silent
default.

**Rationale**: Sources Tome indexes are not always public — internal API
specs, ADRs, and runbooks are named explicitly as target content in the PRD.
Users will not adopt a documentation indexer they cannot trust with internal
material, so "nothing leaves the device by default" is a trust precondition
for adoption, not a convenience.

### II. Graceful Degradation Over Hard Failure

Search MUST NOT fail solely because the embedding service is unavailable —
it MUST fall back to SQLite FTS5 lexical ranking automatically, and chunks
written during an outage MUST be reconciled (re-embedded) once the service
recovers, without requiring a daemon restart or manual re-index. A crawl that
exceeds its configured depth/page-count bounds MUST stop and index what it
already fetched rather than discarding the partial result. Failures at the
source level (unreachable URL, invalid path, unclonable repo) MUST be
recorded in the source's `status`/`error` fields, not thrown as exceptions
that crash the daemon or the calling MCP request.

**Rationale**: Tome sits in the critical path of an agent's tool-calling
loop. A hard failure there degrades the host agent's task, not just Tome's
own UX — every failure mode in the TDD's Error Handling table is deliberately
a degrade-and-continue, not a throw.

### III. Autonomous-Tool-Quality as a Design Requirement

`tome_search` and `tome_fetch` are invoked by the host agent unprompted,
mid-task, with no slash command as a gate. Because there is no explicit
human trigger, the MCP `description` field for these tools is a first-class
design artifact and MUST be reviewed with the same rigor as the input schema
whenever it changes — a description that under-sells proactive use is a
functional regression, not a copy-editing detail. Changes to these
descriptions MUST be evaluated against whether they still drive unprompted
invocation, not just whether they remain accurate.

**Rationale**: The PRD identifies tool-description quality as "a first-class
design concern for the implementation spec, not an afterthought" — this is
the single mechanism standing between Tome and the workaround it exists to
replace (manual `WebFetch`, stale CLAUDE.md pastes).

### IV. Interface-Segregated Storage & Embedding

`DocumentIndex` and `Embedder` MUST be defined and consumed as interfaces
throughout the ingestion pipeline and MCP server; concrete implementations
(`SqliteDocumentIndex`, `OllamaEmbedder`) MUST be swappable without changing
callers. New v1 code MUST depend on the interface, never reach past it to a
concrete implementation's internals (e.g., raw SQL) from outside the
implementation module.

**Rationale**: v2 explicitly plans a hosted registry and an API-based
embedder as additive implementations of the same contracts. If v1 code
couples callers to `better-sqlite3` or to Ollama's specific call shape, that
migration becomes a rewrite instead of a new implementation — the interface
boundary is what keeps the v2 bet cheap to make later.

### V. Minimal v1 Scope, Explicit Deferral

Every capability listed under an "Out of Scope — v1" heading in the PRD or
TDD (scheduled/background re-indexing, push-based context injection,
multi-user/shared indexes, hosted MCP surface, auth, marketplace listing,
cross-machine sync) MUST NOT be implemented as a side effect of other work.
Adding any such capability requires an explicit PRD scope change first, not
an incidental implementation decision made during planning or coding.

**Rationale**: v1's stated purpose is to validate "retrieval quality is good
enough to be worth using daily" before the v2 hosted-business bet is made.
Scope creep into v2-shaped features before that validation defeats the
purpose of having a local-first MVP at all.

## Technology Constraints

- **Runtime**: Node.js / TypeScript for the MCP daemon and ingestion
  pipeline.
- **MCP transport**: `stdio`, via `@modelcontextprotocol/sdk`.
- **Storage**: `better-sqlite3` + `sqlite-vec` for vector search + SQLite
  FTS5 for lexical fallback, in a single SQLite file at
  `~/.claude/plugins/tome/index.db` (or the plugin harness's
  `CLAUDE_PLUGIN_DATA_DIR`). No encryption layer — indexed content is public
  or user-supplied documentation, not private user data, and Principle I
  governs what leaves the device rather than an at-rest encryption
  requirement.
- **Embedding**: Ollama running `nomic-embed-text` (768-dim) as the default,
  local embedder, matching the `Embedder` interface in Principle IV.
- **Crawling**: `cheerio` + `turndown` for HTML→Markdown, `pdf-parse` for
  PDFs, `simple-git` for repo sources.
- **Packaging**: a single Claude Code plugin (`plugin.json`) declaring both
  the `mcpServers` entry and the `skills` entry — no separate daemon
  installation or manual MCP registration step for the user.

Changing any of the above (e.g., swapping SQLite for another store, or
adding a non-local default embedder) is a constitution amendment, not an
implementation detail, because Principles I and IV are written in terms of
these specific technology choices.

## Development Workflow & Quality Gates

- Work proceeds spec-first: `specs/[###-feature-name]/spec.md` → `plan.md` →
  `tasks.md`, per the ASDLC methodology this project follows.
- Every `plan.md`'s Constitution Check gate MUST verify the plan against all
  five Core Principles above before Phase 0 research begins, and again after
  Phase 1 design; violations MUST be justified in that plan's Complexity
  Tracking table or the plan MUST be revised.
- Any task that adds a new external dependency, a new default network call,
  or a new persistent data store MUST be checked against Principle I (does
  it leave the device by default?) and Principle IV (does it go through the
  existing interface boundary?) before being marked complete.
- MCP tool description changes (Principle III) require the same review
  attention as schema changes — a PR that alters a `tome_search` or
  `tome_fetch` description MUST state, in the PR description, why the change
  preserves or improves unprompted invocation.

## Governance

This constitution supersedes ad hoc practice for all work under this
repository. Amendments require:

1. A documented rationale for the change (what problem the current
   principle set fails to address).
2. A version bump per semantic versioning: MAJOR for a backward-incompatible
   principle removal or redefinition, MINOR for a new principle or
   materially expanded guidance, PATCH for wording/clarity fixes with no
   normative change.
3. Propagation to `.specify/templates/*` and any `speckit-*` command/skill
   files if the amendment changes what those artifacts must check for or
   reference.

All `/speckit-plan` runs MUST include a Constitution Check gate against the
current version of this file. Complexity or scope that conflicts with a
principle MUST be justified in the plan's Complexity Tracking section or
resolved by revising the approach — silent non-compliance is not an option.

**Version**: 1.0.0 | **Ratified**: 2026-07-25 | **Last Amended**: 2026-07-25

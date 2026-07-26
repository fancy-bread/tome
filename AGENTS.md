# Agent Guide

This file is for any AI coding agent (Claude Code, Cursor, or otherwise)
working on the Tome codebase itself — not Tome-the-product's own agent
behavior, which is covered by the constitution's tool-quality principle
below.

**Status: pre-implementation.** No server code exists yet — the sections
below describe the target architecture and the rules that apply once
implementation starts, not current file layout.

## Start here

The binding source of truth for this project's design constraints is the
constitution at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md). Read
it before proposing an architecture change, a new dependency, or a new
default behavior. What follows is a summary; the constitution is
authoritative if the two ever disagree.

For calls the constitution and the spec don't settle — tone of an error
message, whether to block or degrade, how terse a response should be —
consult [VISION.md](VISION.md). It's written for exactly that: resolving
ambiguity with taste, not adding new rules.

## Core principles (summary)

1. **Local-first, privacy-by-default** — nothing leaves the user's device
   by default. The v1 embedder (Ollama) and store (SQLite) must work fully
   offline.
2. **Graceful degradation over hard failure** — search must never fail
   just because the embedding service is down; fall back to FTS5. Crawl
   and source failures are recorded in status fields, not thrown.
3. **Autonomous-tool-quality as a design requirement** — `tome_search` and
   `tome_fetch` are called by the host agent unprompted. Their MCP
   `description` fields are a first-class design artifact, not an
   afterthought — review them with the same rigor as the schema.
4. **Interface-segregated storage & embedding** — `DocumentIndex` and
   `Embedder` are interfaces; concrete implementations
   (`SqliteDocumentIndex`, `OllamaEmbedder`) must stay swappable.
5. **Minimal v1 scope, explicit deferral** — anything listed as
   "Out of Scope — v1" doesn't get implemented as a side effect of other
   work. It requires an explicit scope change first.

## Tech stack (v1)

- Runtime: Node.js / TypeScript
- MCP: `@modelcontextprotocol/sdk`, `stdio` transport
- Storage: `better-sqlite3` + `sqlite-vec` (vector) + SQLite FTS5 (lexical)
- Embedding: Ollama + `nomic-embed-text` (local default)
- Crawling: `cheerio` + `turndown` (HTML), `pdf-parse` (PDF), `simple-git`
  (repos)
- Packaging: a single Claude Code plugin (`plugin.json` declaring
  `mcpServers` + `skills`)

Changing any of these is a constitution amendment (see Technology
Constraints in the constitution), not a routine implementation choice.

## Workflow

Work is spec-first: every feature gets `specs/[###-feature-name]/spec.md`
→ `plan.md` → `tasks.md` before implementation. Each `plan.md` must pass a
Constitution Check gate against the five principles above. Don't start
writing implementation code for a feature that doesn't have an approved
spec and plan yet — ask if one should be created first.

## Guardrails

- Don't add a default network call, external API dependency, or persistent
  store beyond what's already in the constitution's Technology Constraints
  without flagging it as a constitution amendment first.
- Don't reach past the `DocumentIndex`/`Embedder` interfaces into a
  concrete implementation's internals from calling code.
- Don't implement anything from an "Out of Scope — v1" list (scheduled
  re-indexing, push-based context injection, multi-user/shared indexes, a
  hosted MCP surface, auth, marketplace listing, cross-machine sync)
  without an explicit scope decision first.
- Don't weaken a `tome_search`/`tome_fetch` tool description without
  explaining why the change preserves or improves unprompted invocation.

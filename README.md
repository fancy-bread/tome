# Tome

A generalist documentation-indexing MCP server for Claude Code (and any
MCP-compatible agent tool). Point it at a URL, a local path, or a git repo;
it crawls, chunks, embeds, and makes the content queryable — the equivalent
of Cursor's `@Docs` indexing, but not tied to one editor.

**Status: pre-release (v0.2.0).** All v1-scoped functionality is
implemented — core interfaces, the ingestion pipeline, the SQLite-backed
index, the MCP server, local embedding, the human-facing skill commands,
and Claude Code plugin packaging — plus the v1.1 fast-follow that lets
you remove a source, not just add one. It hasn't yet had real-world
install/usage validation, so treat it as pre-release rather than a
stable 1.0.

See [VISION.md](VISION.md) for the product point of view — who this is
for and how ambiguous design calls get resolved.

## What it does

- **Sources** — index a URL (bounded crawl), a local directory of
  Markdown/text/PDF, or a git repo.
- **MCP server** exposing five tools:

  | Tool | Description |
  |------|-------------|
  | `tome_search` | Query indexed content; returns ranked chunks with source metadata |
  | `tome_fetch` | Retrieve a full chunk or document by ID |
  | `tome_list_sources` | List all indexed sources and their status |
  | `tome_add_source` | Index a new source (URL, path, or git repo) |
  | `tome_remove_source` | Remove an indexed source and everything under it (documents, chunks, embeddings) |

  `tome_search` and `tome_fetch` are meant to be called autonomously by the
  agent mid-task, the same way it reaches for `Read` or `Grep` — no slash
  command required. `tome_remove_source` is the opposite: deciding what to
  stop indexing is a deliberate human call, so its description is written
  to discourage the agent from calling it on its own initiative.

- **Skill commands** for the explicitly human-driven actions:

  | Command | Action |
  |---------|--------|
  | `/tome:add` | Index a new URL, path, or repo |
  | `/tome:remove` | Remove a previously indexed source |
  | `/tome:sources` | List what's currently indexed |
  | `/tome:search` | Manually query the index (optional override) |

- **Semantic search with lexical fallback** — vector search via
  `sqlite-vec`, embeddings generated locally via Ollama by default, falling
  back to SQLite FTS5 automatically if the embedding service is unavailable.
- **Local-first** — everything lives in one SQLite file on your machine; no
  account, API key, or network dependency required to install or use it.

## How it works

```
tome-*.md (skill files)              ← /tome:search, /tome:add, /tome:remove, /tome:sources
        ↓ bundled alongside the MCP server (.claude-plugin/plugin.json, .mcp.json)
Tome MCP Server (TypeScript, local daemon, stdio)
  ├── Crawler (URL / local path / git repo → raw documents)
  ├── Chunker (documents → overlapping text chunks)
  ├── Embedder (chunks → vectors; Ollama default, graceful degrade to FTS5)
  └── DocumentIndex (SQLite-backed store with vector + lexical search)
```

## Install

```
claude plugin marketplace add fancy-bread/tome
claude plugin install tome@fancy-bread
```

(Local clone, no GitHub: `claude plugin marketplace add /path/to/tome`,
then `claude plugin install tome@fancy-bread`.)

No separate daemon management or manual MCP registration — installing the
plugin gives you the indexed-docs capability directly.

### Ollama (optional, for semantic search)

Tome works fully without this — indexing and search both work with plain
keyword (FTS5) matching. Installing [Ollama](https://ollama.com) upgrades
search from keyword matching to semantic ranking; there's nothing to
configure, Tome detects and uses it automatically.

```
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download the installer from https://ollama.com
```

Ollama typically starts itself in the background after install (as a menu
bar app on macOS, or a system service on Linux). If it isn't running,
start it manually:

```
ollama serve
```

Then pull the embedding model Tome uses:

```
ollama pull nomic-embed-text
```

If Ollama isn't installed, isn't running, or the model isn't pulled,
Tome doesn't error — content is still indexed and searchable by keyword,
and it upgrades to semantic ranking automatically the next time Ollama is
reachable, with no restart or re-index required.

### Troubleshooting

If the MCP tools or `/tome:*` skill commands don't appear after
installing, Claude Code doesn't display an MCP server startup failure
proactively — it's skipped silently. Run:

```
claude --debug
```

and check the output for Tome's initialization errors (e.g. a failed
build, or `dist/index.js` missing). The first session after install runs
a one-time setup step (`npm install && npm run build`); if that step
failed, `--debug` output is where it shows up.

## Contributing

This project follows a spec-first ("ASDLC") workflow: every feature starts
as `specs/[###-feature-name]/spec.md`, then `plan.md`, then `tasks.md`,
governed by the project constitution at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

See [AGENTS.md](AGENTS.md) for repository conventions and the core
principles agents (human or AI) working on this codebase must follow. If
you're using Claude Code specifically, also see [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE)

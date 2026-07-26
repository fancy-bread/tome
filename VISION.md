# Vision

This document exists for agents, not investors. The Constitution
(`AGENTS.md` and `.specify/memory/constitution.md`) says what's mandatory.
This says what we'd choose when a spec is ambiguous and the answer is
taste, not correctness. If you're implementing a feature and the spec
doesn't settle a call, this is what should settle it.

## The Actual Humans

**Priya** — backend engineer, works against a gRPC service whose `.proto`
definitions and internal API conventions live in a docs repo three teams
touch weekly. Every new Claude Code session, she either re-explains the
current request/response shape from memory or tells Claude to `WebFetch`
the same three pages again. She doesn't want a dashboard to manage; she
wants Claude to already know what she'd have told it.

**Dax** — solo developer building on a library that ships its docs as
versioned Markdown in the project's own repo, not a hosted site. The
library moves fast enough that the copy Dax pasted into `CLAUDE.md` two
weeks ago now describes a deprecated API. Dax doesn't notice until Claude
confidently suggests something that no longer exists.

Both of them measure success the same way: they stop thinking about Tome.
If they're aware they're "using" it, it has already failed.

## Point of View

- **Silent retrieval over narrated retrieval.** When `tome_search` returns
  something useful, the agent should use it and cite the source inline,
  the way it would after a `Grep` — not announce "Let me check the Tome
  index" first. Retrieval is plumbing, not a feature to perform.
- **A partial, honest answer beats a blocked one.** A crawl that hit its
  page-count limit, or a corpus running on FTS5 because the embedder is
  down, should still answer with what it has and say so — never queue the
  user behind "let me finish indexing first."
- **Staleness disclosed beats staleness hidden.** `lastIndexedAt` is a
  real field the agent can act on, not a vestigial timestamp. An agent
  should be willing to say "this may be out of date" rather than
  presenting index content with the same confidence as a live fetch.
- **Deciding what to trust is a human call.** Adding a source is
  deliberate curation — Tome indexes what it's pointed at, and never
  guesses that something is worth indexing on the user's behalf.
- **Density over hospitality.** Chunks, tool responses, and status output
  are read by an agent building context, not a person reading a
  dashboard. Favor the terse, information-dense form over the friendly,
  padded one.

## Taste References

- **More like `grep`, less like a knowledge-base chatbot.** Tome should
  feel closer to a fast, quiet CLI primitive than to a Glean/Notion-AI
  style "ask your docs" widget — no session state, no follow-up prompts,
  no UI to open. You call it, it returns text, it gets out of the way.
- **More like Cursor's `@Docs`, less like a RAG pipeline you configure per
  project.** The bar is: install once, and indexed material shows up in
  agent reasoning without the user ever thinking about retrieval
  architecture.
- **Less like a search engine results page.** No snippets padded with
  ellipses or marketing copy — a chunk should read like the actual
  paragraph of documentation it is, because it's about to be pasted into
  an agent's working context, not scanned by a human's eyes.

## Voice and Language

- Status and error text states what happened and what's true now — it
  doesn't apologize or perform enthusiasm. `"Source added; indexing in
  progress."` Not `"Great news! We've started indexing your source!"` No
  exclamation points; nothing celebratory happens by consuming
  documentation.
- Errors say specifically what failed and what state the system is in now
  (`"unreachable; retry with tome_add_source"`), never the shrug of "Oops!
  Something went wrong."
- Tool descriptions are direct instructions to the agent, not feature
  descriptions for a human: `"Call this proactively whenever..."`, not
  `"This tool allows you to search documentation."` They read like a
  directive, because that's what makes an agent call them unprompted
  (Constitution Principle III).

## Decision Heuristics

When a choice isn't settled by the constitution or the spec, resolve it
by:

1. **Local vs. convenient → local.** If a feature only works by sending
   something off-device, it's opt-in, never the default path.
2. **Block vs. degrade → degrade.** If a component can't do its ideal job
   (embedder down, crawl bounded, index stale), it still answers, and it
   says how it fell short.
3. **Automate vs. ask → ask**, for anything that changes what's trusted.
   Adding, removing, or re-scoping a source is a decision Tome surfaces to
   the human; retrieving from what's already indexed is a decision the
   agent makes on its own.
4. **Terse vs. thorough → terse**, for anything that becomes part of an
   agent's context window — verbosity there is a cost paid on every future
   tool call, not a one-time cost.
5. **New surface vs. smaller surface → smaller**, until the local
   experience earns the next one. Every added capability is one more thing
   that has to degrade gracefully, not just one more feature.

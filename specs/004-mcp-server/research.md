# Phase 0 Research: MCP Server

No `[NEEDS CLARIFICATION]` markers remained in Technical Context — the
constitution already names `@modelcontextprotocol/sdk`. What follows is
everything else this milestone had to resolve.

## Tool description text (Constitution Principle III)

**Decision**: Draft the actual `tome_search`/`tome_fetch` descriptions
now, as a design artifact, not an implementation afterthought — per
Principle III's own framing that description quality is load-bearing.

`tome_search`:
> "Search indexed documentation for content relevant to the current
> task. Call this proactively whenever the task might benefit from
> indexed reference material — library docs, internal API specs, ADRs,
> runbooks — do not wait for the user to explicitly ask for a
> documentation lookup."

`tome_fetch`:
> "Retrieve the full chunk or document behind a tome_search result.
> Call this proactively when a search result's excerpt isn't enough
> context to act on — do not wait for the user to ask for the full
> content."

`tome_list_sources` and `tome_add_source` get plain, descriptive text
(what they do, not an instruction to call them unprompted) — the PRD
frames these as human-driven decisions (deciding what to index, checking
status), consistent with milestone 006's skill-file framing; FR-010 only
applies to `tome_search`/`tome_fetch`.

**Rationale**: `tome_search`'s wording is drawn directly from `tdd.md`'s
own drafted example — already vetted as the reference framing.
`tome_fetch`'s is new but follows the identical pattern: name the
triggering situation ("excerpt isn't enough"), then the explicit
instruction not to wait to be asked. Both avoid describing the tool from
a human documentation-reader's perspective ("this tool allows you to...")
in favor of a direct second-person instruction to the calling agent,
since that's what actually drives unprompted use per FR-010.

**Alternatives considered**: Describing inputs/outputs only, letting the
model infer when to call it (rejected — this is exactly the "under-sells
proactive use" failure mode the constitution names as a functional
regression, not a style choice); one shared description for both tools
(rejected — they trigger in different moments, "might have relevant
docs" vs. "excerpt isn't enough," and conflating them weakens both).

## Error mapping at the protocol boundary

**Decision**: Every tool handler is wrapped in try/catch. A caught
`NotFoundError` (from `fetch`) becomes `{ isError: true, content:
[{ type: 'text', text: err.message }] }`. Any other caught error becomes
the same shape using `err.message` (or `String(err)` for a non-`Error`
throw). Nothing is ever re-thrown past the handler.

**Rationale**: This is FR-007/008/009's direct implementation —
`NotFoundError` and "anything unexpected" both degrade to a structured
MCP tool error rather than an uncaught exception, matching Constitution
Principle II's already-established "one failure must not crash the whole
process" pattern from milestones 002/003, just at the protocol boundary
instead of inside a single method.

**Alternatives considered**: Distinguishing error types with different
MCP-level error codes (rejected — no requirement calls for it, and MCP's
tool-result-level `isError` flag is sufficient for FR-007/008/009 as
written; introducing a taxonomy of error codes would be scope beyond what
this milestone's spec asks for).

## Daemon entry point and database path resolution

**Decision**: `src/index.ts` resolves the SQLite file path as
`process.env.CLAUDE_PLUGIN_DATA_DIR` joined with `index.db` when that
variable is set (the real plugin-harness case, arriving in milestone
007), falling back to a fixed local default (`~/.claude/plugins/tome/index.db`,
creating the directory if needed) for standalone/dev runs before the
harness exists. The `Embedder` passed to `SqliteDocumentIndex` is a
small inline no-op class (`embed()` always resolves `null`) defined
directly in `index.ts` — not a new `src/embedding/` module.

**Rationale**: Matches the constitution's own phrasing verbatim
("`~/.claude/plugins/tome/index.db` (or the plugin harness's
`CLAUDE_PLUGIN_DATA_DIR`)"). Keeping the no-op embedder inline avoids
presuming milestone 005's eventual `src/embedding/` shape (its real job
is an `OllamaEmbedder`, a materially different piece of code) — milestone
001's own Project Structure reserved `embedding/` for that milestone
specifically, not for a placeholder.

**Alternatives considered**: Requiring `CLAUDE_PLUGIN_DATA_DIR` to always
be set, erroring otherwise (rejected — the plugin harness that sets it
doesn't exist until milestone 007, so this milestone would then be
unrunnable standalone, which the spec's own Assumptions section says it
must be); creating `src/embedding/no-op-embedder.ts` now (rejected —
Principle V; a one-line class doesn't need its own module ahead of the
milestone that will actually populate that directory).

## Resolved implementation-time verification

All three items flagged during planning/`/speckit-analyze` were confirmed
empirically (a throwaway script against the real installed
`@modelcontextprotocol/sdk` 1.30.0), the same way milestone 002 confirmed
`pdf-parse`'s real API and milestone 003 confirmed `sqlite-vec`'s real
bind types:

1. **Tool-registration API**: the higher-level `McpServer` class, via
   `registerTool(name, { description, inputSchema }, handler)`.
   `inputSchema` is authored as a Zod raw shape (e.g. `{ query:
   z.string() }`) — `zod` ships as a direct dependency of the SDK itself,
   confirmed present at `node_modules/zod`, added here as an explicit
   direct dependency too rather than relying on it transitively. The
   Zod shape is auto-converted to standard JSON Schema (draft-07) for
   the wire — confirmed by inspecting a live `listTools()` response —
   so the actual *protocol-level* shape matches what
   `contracts/tools.ts` sketched in plain JSON Schema; only the
   *authoring* representation changed from the planning sketch.
2. **In-process test transport**: `InMemoryTransport.createLinkedPair()`
   exists at the SDK's package root and works exactly as hoped — one
   transport to a `Client`, the linked other to a server, no child
   process needed for the fast test tier.
3. **Auto-validation (resolves `/speckit-analyze` finding C1
   definitively)**: `McpServer` validates tool-call arguments against
   the registered Zod/JSON schema **automatically**, using AJV (a direct
   SDK dependency, documented as "default, fastest" for Node). A call
   missing a required argument returns `{ isError: true, content: [...]
   } }` **without the handler ever running** — confirmed by a live call
   with a missing required field. This means FR-009 is satisfied
   uniformly across all four tools by the SDK itself, with **no manual
   per-handler validation needed**. The conditional scenarios added to
   tasks.md T011/T013 during `/speckit-analyze` remediation ("if the SDK
   doesn't auto-validate...") turn out unnecessary — implementation
   still includes one test proving this for at least one tool, to prove
   the integration actually works rather than trusting it blindly, but
   no new validation *logic* is written.

## Reconciling tdd.md's response shapes with the actual DocumentIndex contract

**Discovered during planning**: `tdd.md`'s MCP Tool Contracts section was
drafted before milestones 001–003 locked in `DocumentIndex`'s exact
types, and two of its sketched response shapes don't correspond to
anything those types can actually produce without new, unspecified work:

- `tome_fetch`'s response was sketched as `{ id, "text" | "documentText",
  sourceId, uri }` — but `fetch()` returns a `Document` (metadata only:
  `id`, `sourceId`, `uri`, `title`, `contentHash`, `fetchedAt` — no text
  at all) or a `Chunk` (has `text`, but no `uri`/`sourceId` of its own).
  Producing a "full document text" would mean assembling every chunk
  belonging to that document — functionality nothing in this milestone's
  scope asks for.
- `tome_list_sources`'s response was sketched including `documentCount`/
  `chunkCount` per source — `Source` (milestone 001) carries neither, and
  computing them would require new aggregate queries `listSources()`
  doesn't specify.

**Decision**: `tome_fetch`'s response discriminates by a `type` field
(`'chunk' | 'document'`) instead of inventing a `documentText` value:
`{ id, type: 'chunk', text, documentId, ordinal }` or `{ id,
type: 'document', uri, title, sourceId }`. `tome_list_sources`'s response
drops `documentCount`/`chunkCount`, returning exactly what `Source`
carries: `{ id, type, origin, status, lastIndexedAt, error }`.

**Rationale**: Both are honest reflections of what `DocumentIndex`
actually promises, rather than a response shape that reads well in a
design doc but silently can't be built from the types this project has
already locked in. Neither change touches a functional requirement in
spec.md — FR-005/FR-006 describe outcomes ("the full content," "current
type/origin/status/last-indexed time"), not exact field names.

**Alternatives considered**: Extending `DocumentIndex`/`Source` now to
support these fields (rejected — reopens milestone 001's already-merged
interface for a v1 feature nothing in spec.md asks for, pure scope creep
against Principle V); computing document text/counts ad hoc inside the
MCP layer via extra queries the interface doesn't expose (rejected — that
logic belongs in `DocumentIndex`'s implementation if it's ever needed,
not bolted onto the protocol translation layer).

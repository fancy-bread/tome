# Phase 1 Data Model: Local Embedding & Reconciliation

No new persisted entities and no schema change (see research.md #5). This
milestone changes *when* an existing field gets populated, not what
exists. What follows is the state this feature makes real for the first
time, and the internal (non-persisted) tracking it adds.

## `Chunk.embedding` (existing field, from milestone 001)

| Before this milestone | After this milestone |
|---|---|
| Always `null` in production; only ever non-`null` when a test seeds it directly. | `null` immediately after chunking, then either a real 768-dim vector (embedding succeeded at write time) or `null` (service was unavailable) once `runIndexingJob` finishes with it. A chunk left `null` is picked up by reconciliation and may transition to a real vector later, asynchronously. |

No new states are introduced to `Chunk` itself — `embedding: number[] |
null` (from `src/core/types.ts`) is unchanged. What's new is that `null`
now has an observable lifecycle (pending → possibly embedded later)
instead of being a permanent, untested value.

## Reconciliation candidate (query-derived, not a stored entity)

A chunk is a reconciliation candidate exactly when it has no matching row
in `chunk_vectors` — see research.md #5 for the query. This is derived
state, computed fresh on every reconciliation pass; nothing new is
written to represent "needs reconciliation."

## `OllamaEmbedder` (new, implements existing `Embedder`)

Not a data entity — a stateless service client. Its only "state" is
configuration, held in memory for the process's lifetime:

| Field | Type | Default | Notes |
|---|---|---|---|
| `baseUrl` | `string` | `http://localhost:11434` | Never persisted; a constructor option, not user-facing config (Principle V). |
| `model` | `string` | `nomic-embed-text` | Same as above. |

## `SqliteDocumentIndexOptions` (existing, from milestone 003 — one field added)

| Field | Type | Notes |
|---|---|---|
| `dbPath` | `string` | Unchanged. |
| `embedder` | `Embedder` | Unchanged in type; production callers now pass a real `OllamaEmbedder` instead of the milestone-004 `NoOpEmbedder`. |
| `reconciliationIntervalMs` | `number` (optional) | **New.** Test seam only (research.md #6) — defaults to a fixed production interval; not read from any environment variable or exposed to end users. |

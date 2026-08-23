# Feature Specification: Remove a Source

**Feature Branch**: `008-remove-source`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Remove a source: a user who added a URL, path, or git source to Tome needs a way to remove it — deleting the source and everything indexed under it (its documents, chunks, and vector embeddings) so it no longer appears in tome_list_sources or contributes to tome_search results. Today the only way to undo adding a source is deleting the whole index database. This is a local-only v1.1 fast-follow (see specs/000-tome-core/prd.md's new "v1.1 — Fast Follow" section) — deciding what to index (and what to stop indexing) is a human call per VISION.md, so removal must be an explicit, deliberate action (a tome_remove_source MCP tool plus a /tome:remove skill command), never automatic or inferred. Thin slice: remove one source by its id, cascading the deletion through its documents/chunks/vectors in the same SqliteDocumentIndex this project already has; no bulk/multi-source removal, no "undo" or soft-delete/trash, no re-adding removed content automatically."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove a source and its content disappears from search (Priority: P1)

A user who previously added a source (URL, path, or git repo) decides it's no longer wanted — outdated, irrelevant, or added by mistake — and removes it. Afterward, that source is gone from the list of indexed sources, and none of its content shows up in search results anymore.

**Why this priority**: This is the entire point of the feature — without it, there's no way to undo adding a source short of deleting the whole index, which is what the feature exists to fix.

**Independent Test**: Can be fully tested by adding a source, confirming its content is searchable, removing it, then confirming it no longer appears in the source list and no longer appears in search results.

**Acceptance Scenarios**:

1. **Given** a source that has finished indexing, **When** the user removes it, **Then** it no longer appears in the list of indexed sources.
2. **Given** a removed source's content was previously returned by search, **When** the user searches again with the same query, **Then** none of that source's content appears in the results.
3. **Given** a removed source's document or chunk was previously fetchable by id, **When** the user tries to fetch it again, **Then** the system reports it doesn't exist rather than returning stale content.

---

### User Story 2 - Get a clear error when removing a source that doesn't exist (Priority: P2)

A user tries to remove a source using an identifier that doesn't match anything currently indexed — a typo, or a source already removed. The system tells them clearly that nothing matched, rather than silently doing nothing or failing unpredictably.

**Why this priority**: Prevents a confusing "did that work or not?" moment, but the core removal capability in User Story 1 is independently valuable without this.

**Independent Test**: Can be fully tested by attempting to remove a source identifier that was never added (or was already removed) and confirming the system reports a clear, specific error rather than a silent success or a crash.

**Acceptance Scenarios**:

1. **Given** no source matches the given identifier, **When** the user attempts to remove it, **Then** the system reports clearly that no such source exists.
2. **Given** a source was already removed, **When** the user attempts to remove it again, **Then** the system reports the same clear "doesn't exist" outcome, not a crash.

---

### User Story 3 - Remove a source that's still being indexed (Priority: P3)

A user adds a source, then changes their mind and removes it before it's finished indexing (it's still in progress in the background). The removal takes effect — the source doesn't reappear once the in-progress indexing finishes, and none of that indexing's results stick around.

**Why this priority**: A real but narrower timing edge case; the feature is fully useful for the common case (removing an already-`ready` source) without this, but leaving it unhandled would let a background job resurrect a source the user just removed.

**Independent Test**: Can be fully tested by adding a source, removing it while it's still in an in-progress status, waiting for whatever background indexing would have done, and confirming the source never reappears and none of its content becomes searchable afterward.

**Acceptance Scenarios**:

1. **Given** a source is still being indexed, **When** the user removes it, **Then** it no longer appears in the list of indexed sources immediately.
2. **Given** a source was removed while still being indexed, **When** its in-progress indexing would otherwise have finished, **Then** the source does not reappear and none of its content becomes searchable.

---

### Edge Cases

- What happens when the given identifier matches no source? (Expected: a clear, specific "not found" error — see User Story 2 — with no partial or side effect.)
- What happens if a source is removed while it's still being actively indexed? (Expected: see User Story 3 — removal wins, nothing from that in-progress work survives.)
- What happens to a search request already in flight at the exact moment a source is removed? (Expected: no guarantee about that one in-flight request, but every search issued after removal completes must exclude the removed source's content.)
- What happens when the source being removed is the only source currently indexed? (Expected: the system returns to the same state as before anything was ever added — an empty source list and empty search results — not an error.)
- What happens to other sources when one is removed? (Expected: completely unaffected — their documents, chunks, and search results are unchanged.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to remove a previously added source, identified the same way sources are already identified elsewhere (the id returned by adding a source and shown when listing sources).
- **FR-002**: Removing a source MUST delete its record so it no longer appears when listing indexed sources.
- **FR-003**: Removing a source MUST delete every document, chunk, and embedding that belongs to it, so none of that content is returned by search or individually retrievable afterward.
- **FR-004**: System MUST report a clear, specific error — never a silent no-op and never a crash — when asked to remove a source identifier that doesn't exist.
- **FR-005**: Removal MUST be a deliberate, explicit action the user takes — the system MUST NOT remove a source automatically or infer that it should be removed from any other activity.
- **FR-006**: Removal MUST take effect immediately, including for a source still being indexed — that source MUST NOT reappear once in-progress indexing would otherwise have finished, and none of that indexing's results MUST be retained.
- **FR-007**: Removing one source MUST leave every other source's documents, chunks, and search results completely unaffected.

### Key Entities

- **Source**: The existing entity representing an added URL, path, or git repo — now also the direct target of removal.
- **Document / Chunk**: Content belonging to a Source — removed as a consequence of removing their Source, not independently removable in this slice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After removing a source, it no longer appears in the list of indexed sources, 100% of the time.
- **SC-002**: After removing a source, none of its previously indexed content appears in search results, 100% of the time.
- **SC-003**: Attempting to remove a nonexistent source produces a clear, distinct error in 100% of cases — never indistinguishable from a successful removal.
- **SC-004**: Removing one source produces zero observable side effects on any other source's content or availability.
- **SC-005**: A user can remove an unwanted source in a single explicit action, without deleting or rebuilding the entire index.

## Assumptions

- A source is identified by the same id already returned by adding a source and shown when listing sources — no new identification scheme is introduced for removal.
- This is a hard delete: no soft-delete, trash, or undo. Re-adding the same origin afterward is an ordinary "add a source" action that re-crawls from scratch, exactly as if the source had never existed.
- Only one source is removed per action; removing multiple sources at once is out of scope for this slice.
- Removing a source requires no confirmation step beyond the explicit action itself — consistent with how adding a source already requires no separate confirmation.

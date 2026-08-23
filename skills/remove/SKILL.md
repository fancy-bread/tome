---
name: remove
description: Remove a previously indexed source from Tome, deleting everything indexed under it.
argument-hint: <source id>
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

Deciding what to stop indexing is a human call — do not invoke this on
your own initiative; only act when the user has explicitly run
`/tome:remove`. This action is irreversible: it deletes the source and
everything indexed under it (documents, chunks, embeddings), with no
undo.

Parse `$ARGUMENTS` as a source id — the same identifier `tome_add_source`
returned and `tome_list_sources` shows. If it's missing, do not guess —
ask the user to clarify which source they mean. If the user doesn't
already know the id, suggest running `/tome:sources` first to look it
up — do not attempt to resolve a source by origin, name, or any other
guess.

Once you have a source id, call the `tome_remove_source` MCP tool with
it. Report the result back to the user in plain language.

If the `tome_remove_source` call fails — for example, if the id doesn't
match any indexed source — surface the failure to the user readably,
state what went wrong in plain language, don't show a raw error object
or fail silently.

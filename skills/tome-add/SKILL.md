---
name: tome-add
description: Index a new URL, local path, or git repository with Tome.
argument-hint: <type> <origin>
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

Deciding what to index is a human call — do not invoke this on your own
initiative; only act when the user has explicitly run `/tome-add`.

Parse `$ARGUMENTS` as a source type (`url`, `path`, or `git`) followed by
an origin (the URL, local path, or git repository location). If either
the type or the origin is missing, or the type isn't one of `url`,
`path`, or `git`, do not guess — ask the user to clarify which type and
origin they mean, then wait for their answer before proceeding.

Once you have a valid type and origin, call the `tome_add_source` MCP
tool with them. Report the resulting source identifier and status back
to the user in plain language.

If the `tome_add_source` call fails, surface the failure to the user
readably — state what went wrong in plain language, don't show a raw
error object or fail silently.

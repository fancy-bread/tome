---
name: tome-sources
description: List every source Tome has indexed and its current status.
disable-model-invocation: true
---

Checking indexing status is a human call — do not invoke this on your
own initiative; only act when the user has explicitly run
`/tome-sources`.

Call the `tome_list_sources` MCP tool and present every source's type,
origin, status, and last-indexed time to the user in a readable list.

If no sources have been added yet, tell the user nothing is indexed yet
— that's the expected state for a fresh install, not an error.

If the `tome_list_sources` call fails, surface the failure to the user
readably — state what went wrong in plain language, don't show a raw
error object or fail silently.

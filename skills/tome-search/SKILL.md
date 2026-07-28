---
name: tome-search
description: Manually query Tome's indexed documentation.
argument-hint: <query>
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

This is an explicit, on-demand lookup a user asked for by name — do not
invoke this on your own initiative. It is not the primary way indexed
content gets used: you should already be calling the `tome_search` MCP
tool directly and proactively, mid-task, without waiting for this
command. Only act here when the user has explicitly run `/tome-search`.

Treat `$ARGUMENTS` as the search query. If it's empty or just
whitespace, do not run an empty search — ask the user what they'd like
to search for, then wait for their answer.

Once you have a query, call the `tome_search` MCP tool with it — the
same tool and the same ranking you'd use if you were searching
proactively on your own, not a separate or reduced implementation.
Present the ranked results to the user.

If nothing matches, tell the user there are no results — that's a
normal outcome, not an error.

If the `tome_search` call fails, surface the failure to the user
readably — state what went wrong in plain language, don't show a raw
error object or fail silently.

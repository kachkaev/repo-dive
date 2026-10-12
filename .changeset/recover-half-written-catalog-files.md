---
"repo-dive": patch
---

Recover from half-written catalog files.
A scan cut short, or a copy of the catalog taken while one ran (such as a CI cache save), could leave a truncated file behind that failed every later `scan` with "An error occurred in Effect.tryPromise".
Catalog files are now written atomically, `scan` collects a commit again when its record of a past run does not parse, and `index` skips outputs that are missing or cut off.
Errors like that one now also name their cause, e.g. "Unexpected end of JSON input".

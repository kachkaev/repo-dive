---
"repo-dive": minor
---

Extend tree snapshots backwards across founding history grafts.
Snapshot collectors (lines of code, dependencies, file types, loose ends, survival) used to stop at HEAD's first-parent root, so a repository assembled by a migration — effect's monorepo starts at a December 2023 "workspace skeleton" that merges in the absorbed histories — lost every earlier state and its timelines began years after the project did.
The scanned mainline now recognizes that founding-graft signature and continues into the absorbed history reaching back furthest, so those charts cover the project's previous life too.
Re-run `scan` and `index` on an existing catalog to backfill the newly covered commits.

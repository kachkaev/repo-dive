---
"repo-dive": patch
---

Fix duplicate-key warnings in the contributor bar lists. `BarList` keyed each row by its label, which is a contributor's display name — not unique, so two distinct people who resolve to the same name (e.g. an unmerged "Alex" and "Alexander Kachkaev") triggered React's "two children with the same key" console error. `BarList` items now carry a required `id` used as the key: the contributor lists pass their canonical email (the indexer guarantees one row per email, so aliases of the same person can't collide either), and the top-rule and AI-identity lists pass their already-unique rule/identity string.

---
"repo-dive": patch
---

Fix duplicate-key warnings in the contributor bar lists. `BarList` keyed each row by its label, which is a contributor's display name — not unique, so two distinct people who resolve to the same name (e.g. an unmerged "Alex" and "Alexander Kachkaev") triggered React's "two children with the same key" console error. The contributor lists now key by canonical email, which the indexer guarantees is one-per-contributor, so aliases of the same person can't collide either. This covers the human-contributor and bots/AI-agent lists; the AI-identity and top-rule lists keep their already-unique labels via an index fallback.

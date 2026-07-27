---
"repo-dive": minor
---

Merge the "AI co-authors" and "Contributors" dashboard sections into one, so humans, AI agents and bots are measured the same way.
The section gains an `All | Humans | AI agents | Bots` filter and gives every contributor a pair of bars spanning the whole history: commits they authored, hatched at the tail where another kind co-authored them, and — the inverse — commits of other kinds they co-authored, colored by whom they helped.
Only cross-kind collaboration is drawn; three columns of numbers give the exact per-kind counts.

Co-authors now resolve through the same identity pipeline as authors, so `contributors.aliases` (including `displayName`, `url` and `kind`) applies to `Co-authored-by:` trailers, and an agent that only ever co-authors gets its own row.
Humans are keyed by canonical email as before; bots and AI agents are keyed by name and email too, since they share vendor `noreply` addresses — give them an alias group with a `displayName` to merge the variants.
`dashboard.json` drops `aiIdentities` and records `assistedBy` / `assisted` per contributor; the contributor cap now applies per kind. Run `index` to rebuild it.

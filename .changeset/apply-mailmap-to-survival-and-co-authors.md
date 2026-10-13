---
"repo-dive": patch
---

Apply `.mailmap` to survival and co-author identities.
Commit authors have gone through `.mailmap` since 0.18.0, but a person it maps could still appear under their old address in surviving files split by contributor, in line survival snapshots collected before the `.mailmap`, or as an extra contributor when credited in a `Co-authored-by:` trailer.
`repo-dive index` now maps all of these through the current `.mailmap`, so re-running it is enough — no re-scan needed, now or after a later edit to `.mailmap`.

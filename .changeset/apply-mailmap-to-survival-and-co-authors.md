---
"repo-dive": patch
---

Apply `.mailmap` to survival and co-author identities.
Commit authors have gone through `.mailmap` since 0.18.0, but a person it maps could still appear under their old address in surviving files split by contributor, in line survival snapshots collected before the `.mailmap`, or as an extra contributor when credited in a `Co-authored-by:` trailer.
`repo-dive index` now maps these through the current `.mailmap` as well, so re-running it is enough.

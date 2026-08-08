---
"repo-dive": patch
---

Reveal dashboard sections one per paint behind a trailing skeleton.
First paint now stops at the header and the stat tiles; each chart section then mounts in its own interruptible render pass, with a skeleton placeholder at the tail signalling that more of the report is on the way.
Previously the first chart blocked the initial paint and the remaining sections landed in a single deferred commit, so the page looked finished while the bulk of the report was still rendering.

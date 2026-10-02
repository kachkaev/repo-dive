---
"repo-dive": patch
---

Stop `repo-dive ignore` from copying a banner's row of hashes into the catalog heading.
An ignore file that opens with a `###########################` banner and uses `##` headings now gets `## repo-dive catalog`, not the whole row followed by the title.

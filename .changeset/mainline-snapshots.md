---
"repo-dive": patch
---

Take tree snapshots only on HEAD's first-parent chain, removing the cliffs that appeared in every "state over time" chart.

`scan` enumerates commits with a full `git log`, which walks every parent. Sampling a period then picked whichever commit was newest in that walk — often one that lives on a side branch, or one that arrived with a foreign history absorbed by an unrelated-histories merge. Such a commit's tree was never the repository's state, so charting it produced a sheer drop and recovery. React is a good example: its `compiler/` directory came from a separate repository, and monthly sampling kept landing on commits whose entire tree is that one directory — the lines-by-language and code-survival charts dropped by 90% at those points.

Collectors whose output describes the tree at a commit (`tree` and `worktree` strategies — languages, survival, file-types, directives, dependencies, todo-comments) are now sampled from the first-parent chain only. `log` collectors (commit metadata, churn) are unaffected and still see every commit, since a commit's own authorship and diff are facts wherever it sits in the graph.

Existing catalogs heal without a re-scan: `index` leaves off-mainline snapshots out of the cube and reports how many it skipped. Run `scan` again afterwards to fill the periods whose sample had been landing off the mainline.

`status` counts those collectors against the mainline too, so a snapshot collector that has captured everything `scan` will ever give it reads as complete rather than stalling a few commits short.

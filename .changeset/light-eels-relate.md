---
"repo-dive": minor
---

Count lines by language in-process instead of shelling out to `tokei`, so both halves of the "Lines by language" chart describe the same code.

With "shade by year written" off, the chart came from `tokei`, which counts every file it recognizes — lockfiles, minified bundles, generated data. With the toggle on, it came from `git blame`, which only covers scannable source files. A repo whose largest `.json` or `.yaml` file is a lockfile therefore showed a huge language band that vanished the moment the toggle was ticked, and the totals disagreed in both directions.

The `languages` collector now counts lines itself, over exactly the file set `survival` blames, using the blob cache the `directives` and `todo-comments` collectors already share. Toggling shading now keeps every stack and every total identical — only the shading changes. Along the way:

- **No external dependency.** `tokei` no longer needs to be installed, and the collector no longer needs a worktree checkout: it reads blobs from the object database like the collectors around it.
- **Denser and faster.** It samples every commit instead of monthly, so the chart has a point per commit rather than a step per month.
- **One language map.** The extension → language mapping used to live in the dashboard for the shaded view and inside `tokei` for the flat one; it is now a single map in the CLI that both views are labelled from.

Lockfiles, minified bundles, `node_modules`/`dist`/`vendor` and generated files are excluded, as they always were for blame-based views — the chart is about code someone wrote. The collector version is bumped, so run `scan` again to recount; `gc --stale` clears the superseded snapshots.

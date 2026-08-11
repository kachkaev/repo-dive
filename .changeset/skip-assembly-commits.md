---
"repo-dive": patch
---

Skip a migration's assembly commits when sampling tree snapshots.
When the mainline extends across a founding graft, the fresh root and the founding merge run hold half-assembled workspaces (effect's "workspace skeleton" is a near-empty tree that the next eight merges fill one repository at a time), which drew a crash-to-zero spike at the graft boundary.
Those commits now leave the mainline, so the timeline steps from the absorbed history's tip straight to the first post-assembly commit.
Re-run `scan` and `index` (or `gc`) on an existing catalog to drop the already collected assembly snapshots from the cube.

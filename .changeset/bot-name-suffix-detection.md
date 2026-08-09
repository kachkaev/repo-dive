---
"repo-dive": patch
---

Count contributors whose name ends in `bot` as bots.

The kind is derived from the name when the config leaves it unset, and previously only recognized the usual suspects — renovate, dependabot, github-actions and anything with a `[bot]` suffix.
A trailing `bot` word now counts too, so `Release bot` and `deploy-bot` land in the bot row while names that merely end in those letters, like `Kate Talbot`, stay human.
Re-run `repo-dive index` on an existing catalog to reclassify past commits — no re-scan needed.

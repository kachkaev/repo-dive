---
"repo-insighter": minor
---

Add an optional `repo-insighter.config.ts` at the root of the analyzed repository (knip-style; `.mjs`/`.js` also accepted). Everything keeps working with zero config.

- **Author aliases** — `authors.aliases` declares groups of email identities that belong to one person (work + personal email, GitHub noreply, name variants); the first entry of each group is canonical. A group can be a plain array of emails or a rich object that also sets a `displayName` (shown in charts and the authors table) and a `url` (the name links to it, e.g. a GitHub profile). Emails match either the raw commit email or its prettified noreply handle, so you can list the handle you see in the report. The `index` step merges them before building the cube's dashboard data, so commit/churn attribution, the authors table, and code-survival-by-author all count each person once.
- **Configurable chart cap** — `authors.maxInCharts` (default 10) sets how many authors the per-author charts keep before folding the rest into "Other"; the authors bar list keeps twice that. The categorical palette was widened to 20 slots so larger stacks stay legible.

Import `defineConfig` from the new `repo-insighter/config` entry point for type-checking and editor IntelliSense.

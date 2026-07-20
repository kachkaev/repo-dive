---
"repo-insighter": minor
---

Add an optional `repo-insighter.config.ts` at the root of the analyzed repository (knip-style; `.mjs`/`.js` also accepted). Everything keeps working with zero config.

- **Contributor aliases** — `contributors.aliases` declares groups of email identities that belong to one person (work + personal email, GitHub noreply, name variants); the first entry of each group is canonical. A group can be a plain array of emails or a rich object that also sets a `displayName` (shown in charts and the contributors table), a `url` (the name links to it, e.g. a GitHub profile) and a `kind`. Emails match either the raw commit email or its prettified noreply handle, so you can list the handle you see in the report. The `index` step merges them before building the cube's dashboard data, so commit/churn attribution, the contributors table, and code-survival-by-contributor all count each person once.
- **Contributor kinds** — each contributor is a `human` (default), `bot`, or `ai` agent. `kind` can be set explicitly per alias group or is auto-derived from the commit author's name/email (automation bots and known AI coding agents are recognized). The dashboard badges non-humans with an icon and lists bots & AI agents separately from human contributors.
- **Configurable chart cap** — `contributors.maxInCharts` (default 10) sets how many contributors the per-contributor charts keep before folding the rest into "Other"; the contributors bar list keeps twice that. The categorical palette was widened to 20 slots so larger stacks stay legible.

The dashboard now speaks of **contributors** (the people concept) rather than "authors"; the raw git-author fields in the cube are unchanged.

Import `defineConfig` from the new `repo-insighter/config` entry point for type-checking and editor IntelliSense.

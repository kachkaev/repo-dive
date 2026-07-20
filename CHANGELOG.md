# repo-insighter

## 0.2.0

### Minor Changes

- 2ad06f6: Add an optional `repo-insighter.config.ts` at the root of the analyzed repository (knip-style; `.mjs`/`.js` also accepted). Everything keeps working with zero config.

  - **Contributor aliases** — `contributors.aliases` declares groups of email identities that belong to one person (work + personal email, GitHub noreply, name variants); the first entry of each group is canonical. A group can be a plain array of emails or a rich object that also sets a `displayName` (shown in charts and the contributors table), a `url` (the name links to it, e.g. a GitHub profile) and a `kind`. Emails match either the raw commit email or its prettified noreply handle, so you can list the handle you see in the report. The `index` step merges them before building the cube's dashboard data, so commit/churn attribution, the contributors table, and code-survival-by-contributor all count each person once.
  - **Contributor kinds** — each contributor is a `human` (default), `bot`, or `ai` agent. `kind` can be set explicitly per alias group or is auto-derived from the commit author's name/email (automation bots and known AI coding agents are recognized). The dashboard badges non-humans with an icon and lists bots & AI agents separately from human contributors.
  - **Configurable chart cap** — `contributors.maxInCharts` (default 10) sets how many contributors the per-contributor charts keep before folding the rest into "Other"; the contributors bar list keeps twice that. The categorical palette was widened to 20 slots so larger stacks stay legible.

  The dashboard now speaks of **contributors** (the people concept) rather than "authors"; the raw git-author fields in the cube are unchanged.

  Import `defineConfig` from the new `repo-insighter/config` entry point for type-checking and editor IntelliSense.

## 0.1.1

### Patch Changes

- 0ec82a1: Declare the true Node floor: `node:sqlite` (used by index/query/mcp) requires Node ≥ 22.13, and `engines` now says so instead of promising 22.0.
- 0ec82a1: Large-repo scan performance: log-strategy collectors (commit-meta, churn) batch the whole history into one `git log` pass, and content-scanning collectors (directives, todo-comments) cache results per blob (`git cat-file --batch` + SQLite blob cache + in-process memo) so only never-seen file contents are scanned. Survival sampling defaults to quarterly, and `engines.node` honestly reflects the `node:sqlite` floor (≥ 22.13).

## 0.1.0

### Minor Changes

- 17ad1f1: Ask the repository questions: new `query` command runs read-only SQL against the metrics cube, and `repo-insighter mcp` serves the cube over the Model Context Protocol (stdio) with `schema` and `query` tools for AI agents.

## 0.0.3

### Patch Changes

- 4181c5b: New `report` command: exports the dashboard as one self-contained HTML file (charts, data and styles inlined) that opens anywhere without installing anything.

## 0.0.2

### Patch Changes

- 69bfbe4: Bare `npx repo-insighter` now runs the whole pipeline — scan, index and dashboard (with browser auto-open) — and scan progress includes a rate/ETA estimate.

## 0.0.1

### Patch Changes

- `index` command (SQLite metrics cube + dashboard data) and `dashboard` command serving an interactive React/visx dashboard: languages over time, monthly commits with AI co-author share, churn, lint-suppression trends, top suppressed rules, code survival by cohort and author.

- Four new collectors (languages via tokei, eslint/ts directives, todo-comments, line survival via blame), commit trailers in commit-meta, per-collector sampling policies, and lifecycle commands: `collectors` and interactive `gc`.

- AI co-author detection excludes automation bots (renovate, dependabot, github-actions); GitHub noreply author emails are shortened to usernames in dashboard data.

- README reflects the implemented pipeline and npx-based usage from inside the analyzed repository.

- Initial end-to-end release test: catalog scaffolding, first collectors (`commit-meta`, `churn`, `file-types`) and the `scan`/`status` commands.

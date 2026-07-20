# repo-insighter

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

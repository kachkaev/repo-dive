---
"repo-dive": patch
---

Plot measurements of the tree against the committer date so rebased history stops zigzagging.

Every chart placed each commit at its **author** date.
Under a rebase or squash-merge workflow that is when the work was written, not when it landed, so it can sit months earlier and does not increase along the first-parent chain: on ollama's mainline it steps backwards 364 times, by up to four months.
Each of those commits dragged the current line counts back into a stretch the chart had already drawn, which is what produced the dense vertical stripes across the stacked areas.

Which date a series uses now follows the shape of the series:

- **Measurements of the tree at points in time** — lines by language, file types, suppressions, dependencies, code-survival totals, and the snapshots `weekly` / `monthly` / `quarterly` sampling picks — are positioned by the **committer** date, the instant the repository actually looked like that. It is the only one of the two that runs forwards along the history, so it is the only one a time axis can use.
- **Counts of work** — the commit calendar, commits and churn per month, the AI-commit stat — keep binning by the **author** date. Bucketing by day or month makes them immune to the zigzag, and the author date is the clock `git blame` reports for code-survival cohorts, so "lines added in month M" and "lines belonging to cohort M" stay the same lines.

Attribution is unchanged — who a commit belongs to is still its git author.
The cube's `commits` table gains a `committed_at` column next to `authored_at` so queries can pick either, and the MCP `schema` tool explains which to reach for.

Existing catalogs heal on the next `repo-dive index` — no re-scan needed, since the dates come from git rather than from collected output.

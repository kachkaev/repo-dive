---
"repo-dive": patch
---

Draw every chart against the committer date so rebased history stops zigzagging.

Timelines placed each commit at its **author** date.
Under a rebase or squash-merge workflow that is when the work was written, not when it landed, so it can sit months earlier and does not increase along the first-parent chain: on ollama's mainline it steps backwards 364 times, by up to four months.
Each of those commits dragged the current line counts back into a stretch the chart had already drawn, which is what produced the dense vertical stripes across the stacked areas.

The whole dashboard now runs on one clock — the committer date, i.e. when a commit became part of the history — so every chart answers the same question: when did this repository's trunk change.
That covers the snapshot series (lines by language, file types, suppressions, dependencies, code survival), the commit calendar, commits and churn per month, the `scan` summary, and period sampling (`weekly`, `monthly`, `quarterly`), which now means one snapshot per period of the repository's own history.

The visible trade-off is that activity charts no longer carry the contributor's own timezone or the delay between writing and landing.
Measured across ollama's 5.6k commits it is small: the calendar keeps 924 of its 947 active days, its median stays at 4 commits per day, and its weekend share moves from 9.9% to 9.6%.

Attribution is unchanged — who a commit belongs to is still its git author.
The cube's `commits` table gains a `committed_at` column next to `authored_at`, so both dates remain queryable, and the MCP `schema` tool points queries at the right one.

Existing catalogs heal on the next `repo-dive index` — no re-scan needed, since the dates come from git rather than from collected output.

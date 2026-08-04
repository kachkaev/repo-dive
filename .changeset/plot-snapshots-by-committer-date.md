---
"repo-dive": patch
---

Plot snapshot charts against the committer date so rebased history stops zigzagging.

Every timeline that describes the state of the tree — lines by language, file types, suppressions, dependencies, code survival — placed each snapshot at its commit's **author** date.
Under a rebase or squash-merge workflow that is when the work was written, not when it landed, so it can sit months earlier and does not increase along the first-parent chain: on ollama's mainline it steps backwards 364 times, by up to four months.
Each of those commits dragged the current line counts back into a stretch the chart had already drawn, which is what produced the dense vertical stripes across the stacked areas.

These charts now use the committer date, the instant the repository actually looked like that.
Period sampling (`weekly`, `monthly`, `quarterly`) buckets by the committer date too, so a policy means one snapshot per period of the repository's own history.
The commit calendar, commits per month and churn per month still measure the author date — they answer when the work was done rather than when it landed.

The cube's `commits` table gains a `committed_at` column alongside `authored_at`, and the MCP `schema` tool points queries at the right one.

Existing catalogs heal on the next `repo-dive index` — no re-scan needed, since the dates come from git rather than from collected output.

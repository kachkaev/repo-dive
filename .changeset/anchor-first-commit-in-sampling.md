---
"repo-dive": patch
---

Include the repository's first commit in every sampling policy.
Period policies (weekly, monthly, quarterly) keep the newest commit per period, so the very first commit was only sampled when it happened to be the newest in its bucket — sampled collectors like survival started their timelines at the first period boundary instead of the repository's birth.
Every policy now anchors both endpoints: HEAD and the first commit are always included.
Existing catalogs heal on the next regular `repo-dive scan` (it picks up the newly sampled first commit as a single new collector run — no `--force` needed); run `repo-dive index` afterwards to refresh the dashboard data.

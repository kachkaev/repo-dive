---
"repo-dive": minor
---

Add a time range select to the contributors chart.
Like the commit calendar, the chart can now be narrowed to the last 12 months, this year, the last 5 years or a single year, and it ranks contributors by what they did in that range.
To make this possible, `dashboard.json` now lists every contributor and points each commit row at its author and cross-kind co-authors; the per-contributor totals and the commit rows' `author` email are gone, and the file comes out slightly smaller.
Run `repo-dive index` again to get the select on an existing catalog.

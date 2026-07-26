---
"repo-dive": minor
---

Sample the `survival` collector monthly instead of quarterly, so code-survival charts (by cohort, by contributor, by language) plot a point per month like the rest of the dashboard rather than four per year. Scans cost roughly 3× more blame snapshots as a result; pass `scan --sample quarterly` to get the old cadence back on large repositories. Existing quarterly snapshots stay in the catalog and are reused — re-run `scan` to fill in the months between them, then `index`.

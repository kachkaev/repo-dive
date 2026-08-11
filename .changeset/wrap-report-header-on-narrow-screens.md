---
"repo-dive": patch
---

Wrap the dashboard's report header more gracefully on narrow screens.

The coverage clause now moves to the next line as a whole instead of leaving `coverage:` stranded above its dates, and a `YYYY-MM-DD` date is never split across two lines at its hyphens.

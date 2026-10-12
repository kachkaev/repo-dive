---
"repo-dive": patch
---

Fix the commit calendar subtitle to name the author's date.
It claimed days were bucketed by the committer's local date, but the calendar counts each commit on the day it was written; it now reads "days bucketed by the author's local date, i.e. when each commit was written".

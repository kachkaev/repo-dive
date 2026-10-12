---
"repo-dive": patch
---

Fix the commit calendar subtitle to name the author's date.
Since 0.9.0 it said days were bucketed by the committer's local date, but the calendar has always counted each commit on the day it was written, in the author's timezone, so the counts are unchanged.

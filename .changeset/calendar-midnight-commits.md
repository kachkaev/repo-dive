---
"repo-dive": patch
---

Keep commits made around midnight in the commit calendar.
Commits fall on their author's local day, which at the edges of the history can be a day past the report's UTC date or a day before the first commit's own date.
Such a day used to read "After this report was generated" or "Before the first commit", leaving its commits out of the calendar's totals and the contributors chart's ranges.

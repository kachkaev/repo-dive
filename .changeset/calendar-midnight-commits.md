---
"repo-dive": patch
---

Keep commits made around midnight in the commit calendar.
Commits fall on their author's local day, which at the edges of the history can be a day past the report's UTC date or a day before the first commit's own date; such a day used to read "After this report was generated" or "Before the first commit", and its commits were missing from the calendar's totals and from the contributors chart's ranges.
The calendar's subtitle now also says it buckets days by the author's local date, as it has done since commit counts moved to the author date.

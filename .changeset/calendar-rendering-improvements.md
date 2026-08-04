---
"repo-dive": minor
---

Sharpen the commit calendar's edges, labels and readouts.

Days outside the report's coverage — before the first commit, or after the report was generated — are drawn as outlines instead of being left blank, so "we have no data" reads differently from "no commits".
A month whose 1st does not land on the first day of the week now has its label shifted one column to the right, rather than hanging over the gap that precedes the month.
Day-of-week labels are down to two letters ("Mo", "Tu"), which also buys back enough width for the widest possible year to fit: the calendar no longer scrolls horizontally on a wide screen.
What width a strip does not need is now spent evenly on both sides instead of pooling to its right.

A day's detail moved out of the caption below the calendar and into a tooltip styled like the other charts' hover cards, so the calendar no longer changes height as the pointer travels across it.
The tooltip names the weekday alongside the date, and days outside the coverage get one too, saying which edge of the report they fall off.

The caption itself now gives the range's total and the busiest day a line each, names the busiest day's weekday, and drops the nested parentheses the two used to share.

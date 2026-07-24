---
"repo-dive": minor
---

Add a GitHub-style commit calendar to the dashboard.

The new **"Commit calendar"** section shows commits per day as a heatmap, with horizontal gaps between months so month boundaries stay readable.
A range dropdown switches between the last 12 months (whole months, the current partial month shown in full), this year, the last 3 years, all years and any individual year; multi-year ranges render one strip per year, newest first.
Days are bucketed by the author's local date, cell intensity uses quartiles of nonzero daily counts across the whole history (so switching ranges never recolors a day), and hovering a cell reveals its date, commit count and AI-assisted share.
On narrow screens the calendar keeps its cell size and scrolls horizontally.

A new `charts.weekStartsOn` config option (`"monday"` by default, `"sunday"` also supported) sets the first day of the week for calendar-shaped charts.

---
"repo-dive": patch
---

Fix the tooltip reading "No data" over the outer halves of a bar chart's first and last bars.
Bars are centred on their point, so those edge pixels fell just outside the data's own time span and were treated as a gap.

---
"repo-dive": patch
---

Snap the chart hover card to the first and last points at the chart edges.
The edges of the lines, files and dependencies charts used to read "No data" when the cursor landed a fraction of a pixel past the last point or on a day the current split had no sample for.
Their hover area now reaches 4px past both the plot and the data, and the commits bar chart no longer shows an empty month past its last bar.

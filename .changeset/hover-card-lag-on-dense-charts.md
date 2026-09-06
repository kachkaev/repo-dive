---
"repo-dive": patch
---

Fix hover card lag on dense charts.
The crosshair and hover card of the time-series charts now sit on their own compositor layers, so moving the cursor over a chart with thousands of data points (e.g. lines of code by language in a repo with many commits) no longer redraws every stacked area on each mouse move.

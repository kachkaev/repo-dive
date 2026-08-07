---
"repo-dive": minor
---

Unify the lines-of-code timelines into one "Lines of code" chart with toggles.
The former "Lines by language", "Code survival by cohort" and "Code survival by contributor" charts become a single chart — placed before all others — switched by three segmented controls: all lines | by language | by contributor, no shading | shade by year written, and absolute counts | percentage; the legend and "View data" table follow the selection, and options whose data is missing from an older dashboard.json are disabled with an explanatory tooltip.
Every chart section now shares one layout: title, constant-wording subtitle, controls, then a frame holding only the visual with its legend centered below like a figure caption, with data tables after the frame — so the #/% toggles and the kind filters of the calendar and contributors moved out of their frames into one flat segmented style, and the calendar's range select matches it (no visible label, no value nudge when opened).
The unified chart keeps a single x-axis across every variant, so no toggle shifts the marks, the controls or the axis.
Hovering a stacked chart no longer re-renders the whole SVG (~30 ms → ~8 ms per frame): the crosshair and tooltip are separate components and d3-array is dropped, keeping the marks memoized by React Compiler.
Existing catalogs render without a re-scan; per-year shading lights up only where the catalog already carries per-year survival data.

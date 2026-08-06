---
"repo-dive": minor
---

Unify the lines-of-code timelines into one "Lines of code" chart with toggles.
The former "Lines by language", "Code survival by cohort" and "Code survival by contributor" charts become a single chart — placed before all others — switched by three segmented controls: all lines | by language | by contributor, no shading | shade by year written, and absolute counts | percentage.
The legend and "View data" table adapt to the selection, and options whose data is missing from an older dashboard.json are disabled rather than hidden.
Chart controls now follow one universal pattern: they sit between the section header and the frame (which keeps only the chart and the legend), so the #/% toggle of the dependency and commit charts moved out of the frame and gained the same "absolute counts | percentage" labels, and the calendar's and contributors' kind filters moved above the frame in the same segmented style.
Legends render centered below their chart like a figure caption — subtitles keep constant wording and legends no longer sit above the marks, so toggling never shifts the chart or the controls.
The chart's x-axis is pinned to the union of the per-commit and sampled datasets' date extents, so switching the dimension never nudges the axis either.
The calendar's intensity scale and range summary are centered the same way.
The calendar's range select drops its visible "Range" label, matches the toggle height, and opens as a plain dropdown, so the selected value no longer nudges when it expands.
Controls render flat — no shadows — and the select keeps the toggles' transparent background in dark mode too.
Hovering a stacked chart is much cheaper: the crosshair and tooltip moved into their own components and the d3 bisector was replaced with an inline search, so React Compiler keeps the areas and bars memoized instead of re-rendering the whole SVG on every mouse move.
Existing catalogs render without a re-scan; per-year shading options light up only where the catalog already carries per-year survival data.

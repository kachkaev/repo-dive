---
"repo-dive": minor
---

Unify the lines-of-code timelines into one "Lines of code" chart with toggles.
The former "Lines by language", "Code survival by cohort" and "Code survival by contributor" charts become a single chart — placed before all others — switched by three segmented controls: all lines | by language | by contributor, no shading | shade by year written, and absolute counts | percentage.
The legend, subtitle and "View data" table adapt to the selection, and options whose data is missing from an older dashboard.json are disabled rather than hidden.
Chart controls now follow one universal pattern: they sit between the section header and the frame (which keeps only the legend and the chart), so the #/% toggle of the dependency and commit charts moved out of the frame and gained the same "absolute counts | percentage" labels.
Existing catalogs render without a re-scan; per-year shading options light up only where the catalog already carries per-year survival data.

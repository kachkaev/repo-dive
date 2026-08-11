---
"repo-dive": minor
---

Add per-chart Markdown annotations via `charts.annotations` in the config.
Each note is keyed by a chart section's stable id (e.g. `"lines-of-code"`) and rendered in a callout between that chart's heading and the chart itself — for explaining oddities the data alone cannot, like a history migration that makes a timeline sparse.
Markdown is limited to paragraphs, `-` lists, bold, italics, inline code and links.
An unknown chart id fails `index` with the list of known ids, so a typo cannot silently drop a note.

---
"repo-dive": patch
---

Align the dashboard header's hover states and unify tooltip styling with the charts.

The repo breadcrumb now takes its hover color as a whole — group, separators and name together — so it reads as one link.
Dates without a link lose the link-like dotted underline and show a `help` cursor instead of pretending to be clickable, and the repo-dive link explains itself in a tooltip.
The design-system tooltip drops shadcn's inverted look for the muted bordered card the chart hover tooltips already use, so every floating readout in the dashboard shares one appearance.

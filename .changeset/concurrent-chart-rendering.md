---
"repo-dive": patch
---

Keep the dashboard responsive while charts re-render, and stagger the initial load.
Chart controls (split, shading, absolute/percentage, calendar range and kind filters) now apply instantly: the expensive SVG re-render happens in an interruptible deferred pass via React's concurrent features, with the outgoing chart dimming slightly until the new one is ready.
First paint stops at the header, the stat tiles and the first chart; the sections below the fold — and the hidden "View data" table bodies, which can hold one row per commit — mount in a deferred render behind it, so the report appears sooner and stays interactive while the rest fills in.
Purely a dashboard rendering change: existing catalogs and dashboard.json files work as they are.

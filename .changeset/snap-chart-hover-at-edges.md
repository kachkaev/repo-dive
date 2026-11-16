---
"repo-dive": patch
---

Snap chart hover to the first and last points at the edges.
Hovering just past either end of a time chart used to read "No data", e.g. `2026-11-17 · Tuesday · No data` on a report made on Monday, or `Dec 2026 · No data` in commits per month.
The edges now show the first or last point, while genuine gaps, such as the dependencies chart before the first lockfile, still read "No data".

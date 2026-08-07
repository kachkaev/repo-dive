---
"repo-dive": patch
---

Hold the "Lines of code" value axis still across the chart's toggles.

The chart scaled its y axis to whichever variant was on screen, so switching the split or the age shading could rescale the areas under the cursor.
The variants come from two sources — per-commit language counts and git blame at sampled commits — whose totals differ slightly, and the axis followed each in turn.

Both axes now share one domain across every toggle combination, computed from the union of the two sources, matching what the time axis already did.
Where the two sources disagree about how many lines a tree holds, the areas now differ visibly instead of each stretching to fill the frame.
Percentage mode is unaffected: it always spans 0–100%.

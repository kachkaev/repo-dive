---
"repo-dive": patch
---

Spell out the day of the week, and name it in every chart tooltip that shows a date.

The two-letter abbreviations earn their place in the commit calendar's row gutter, where seven of them stand side by side over 10px cells and read as a column.
On their own — in a hovered day's tooltip, or in the "Busiest day" line under the strips — "2026-08-05 · We" made the reader decode something the space was there to spell out, so both now say "2026-08-05 · Wednesday".

Dates elsewhere in the report gain the weekday they were missing.
Every chart whose tooltip names a day — lines of code, direct dependencies, dependencies, fighting the linter — now stamps it "2025-10-02 · Thursday", and the header's generated-at and coverage tooltips lead with the weekday too.
The commits-per-month tooltip, which had been reporting a bucket's synthetic mid-month timestamp as though it were a date, now names the month ("Jan 2024") the way the churn chart beside it already did.

Purely a dashboard rendering change: existing catalogs and dashboard.json files work as they are.

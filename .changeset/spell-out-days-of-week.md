---
"repo-dive": patch
---

Spell out the day of the week, and name it in every chart tooltip that shows a date.

Two-letter abbreviations stay in the commit calendar's row gutter, where they have to fit 10px cells; everywhere a weekday follows a date it is now written out ("2025-10-02 · Thursday").
The commits-per-month tooltip names the month instead of the mid-month timestamp it had been reporting as a date.
Dates and counts render in tabular figures, and the weekday sits in a fixed slot, so hover cards no longer resize under the cursor.

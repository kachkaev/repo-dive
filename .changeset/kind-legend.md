---
"repo-dive": minor
---

Add a universal contributor-kind legend across the dashboard: reserved colors for humans (blue), bots (amber) and AI agents (plum), with diagonal hatching marking AI-assisted work. The commit calendar now stacks each day's cell by author kind (volume as opacity) and gains kind filter chips; commits per month splits into Human / Human · AI-assisted / AI agent / Bot; the churn chart hatches AI-assisted added lines; contributor lists and the AI co-authors chart use the kind colors; and the survival-by-contributor chart folds bots and AI agents into one band per kind. `dashboard.json` now records each commit's author kind, and drops its `monthly` rollup: both monthly charts sum the per-commit rows the calendar already loads. Run `index` to rebuild it.

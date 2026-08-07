---
"repo-dive": patch
---

Anchor the dashboard's AI-commit share to when the catalog was generated instead of to wall-clock now.
The tile covers the last 90 days, but the window was measured back from the moment the page happened to be opened, so any dashboard.json older than 90 days matched no commits at all and the tile rendered an em dash instead of a percentage.
The window now runs back from `generatedAt`, which is what every other date in the report is already anchored to, so the same catalog renders the same share however long after the scan it is opened.
Existing catalogs heal on reload — no re-index needed.

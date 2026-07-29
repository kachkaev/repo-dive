---
"repo-dive": patch
---

Build the dashboard with a relative base (`./`), so the bundle works from any directory of any static host — not only a domain root.
`repo-dive dashboard` and `repo-dive report` behave exactly as before; the change matters when copying `dist/dashboard` together with a `dashboard.json` onto static hosting (e.g. GitHub Pages), where the absolute `/assets/…` URLs used to 404.

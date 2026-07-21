---
"repo-insighter": minor
---

Break the code-survival charts down by the year each surviving line was authored.

- **Survival by contributor** starts as one flat color per contributor; a **"Shade by year written"** checkbox splits every contributor's area into per-year age bands. Each band is a lightness shade of the contributor's base color — the newest year at full color, older years fading toward the surface — so you can see, within one person's contribution, how much is fresh versus long-lived. The legend and hover tooltip stay one row per contributor either way.
- **Survival by cohort** flips its ramp for consistency: the newest year is now the fullest color and the oldest the palest (previously reversed).
- Both charts share a single, repo-wide set of age shades so a given year reads the same everywhere. The number of shades is the repo's age in years, capped at 10 (intended to become a config option); years beyond the window fold into a single `≤YYYY` band.

`dashboard.json` survival rows gain a `byContributorYear` field (living lines per contributor, split by authoring year); it is rebuilt from cached facts on the next `index`, and older dashboards without it fall back to the flat contributor chart.

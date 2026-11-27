---
"repo-dive": minor
---

Add an experimental Effect UI dashboard, opted into with `--ui effect`.
It is a port of the React dashboard to [Effect UI](https://github.com/Effect-TS/ui) that reads the same `dashboard.json` and aims to match it exactly, chart for chart and interaction for interaction.
The flag works on the bare pipeline, `dashboard` and `report`, and the GitHub Action takes it as its `ui` input.
React stays the default while the port is experimental.

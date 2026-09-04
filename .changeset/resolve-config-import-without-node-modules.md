---
"repo-dive": patch
---

Resolve a config's `repo-dive/config` import in repositories without `node_modules`.
Every command used to exit with `Cannot find package 'repo-dive'` when the analyzed repository was a bare clone tracking a `repo-dive.config.ts` that imports `defineConfig` — the shape the GitHub Action and the "Analyzing a different repository" recipe produce.
The import now falls back to the repo-dive installation running the command whenever the repository cannot resolve it itself.
Node 22.15 or newer is now required, up from 22.13.

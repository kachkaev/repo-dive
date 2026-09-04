---
"repo-dive": patch
---

Load a `repo-dive.config.ts` that imports `defineConfig` from a repository without `node_modules`.
`scan` and every other command used to exit with `Cannot find package 'repo-dive'` when the analyzed repository was a bare clone — the shape the GitHub Action and the "Analyzing a different repository" recipe produce; the import now falls back to the repo-dive installation running the command.
Node 22.15 or newer is now required, up from 22.13.

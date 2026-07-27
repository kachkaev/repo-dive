---
"repo-dive": minor
---

Warn when ignore files miss the catalog, and make its location configurable. The catalog hides itself from git with a nested `.gitignore`, but prettier, markdownlint, cspell, eslint, `docker build` and `npm pack` each read a single ignore file at the repository root, so its thousands of files quietly became their input. `scan`, `index` and `status` now check every root `.*ignore` file and warn about the ones that do not cover the catalog; the new `repo-dive ignore` command appends the entry to each of them (`--dry-run` to preview; existing files are amended, none created). New `catalog` config section: `catalog.dir` moves the catalog anywhere — pointing it outside the repository leaves the analyzed working tree untouched and skips the ignore-file check altogether — and `catalog.checkIgnoreFiles: false` silences the warning.

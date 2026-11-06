---
"repo-dive": minor
---

Add a by-purpose split to the lines and files charts.
Files now sort by path into Production, Tests, Docs, Examples, Tooling, AI instructions, Test data, Assets, Generated & vendored and Other, and the new `filePurposes` config adds rules, typed custom purposes or a clean slate with `skipBuiltInRules`.
"Number of files" now counts every file git tracks, while "Lines of code" counts the first six purposes, so effect's `Generated.ts` no longer counts while Perl and a few other languages now do.
Existing catalogs need one `repo-dive scan`, which blames the sampled commits again.

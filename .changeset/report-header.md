---
"repo-dive": minor
---

Rework the report header around the repository's own identity.

The heading is now a breadcrumb of the `origin` remote — `kachkaev / repo-dive` under the GitHub or GitLab mark, or the host followed by the path on any other forge — linking to the repository itself; a repo with no (or a purely local) remote keeps its checkout name, unlinked.
That also fixes the name shown for a clone whose directory says nothing about it: the published examples used to be titled "analyzed".

The line below reads `Analyzed by repo-dive at <date> · coverage: <first> — <last>`.
Each date carries a tooltip with its full timestamp, the two coverage dates name the commit each one comes from, and on GitHub and GitLab they link straight to that commit.
`dashboard.json` gains `repo.remoteUrl`, `repo.firstCommitSha` and `repo.lastCommitSha`, and `repo.name` now prefers the remote's name — run `index` to rebuild it (older files still render, minus the new links).

The stat tiles lose "Suppressions" — the directives chart covers it in more depth — and "Commits" now spells out how many contributors produced them, which is where the header's own commit and contributor counts went.

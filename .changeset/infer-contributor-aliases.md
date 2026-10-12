---
"repo-dive": minor
---

Fold a contributor's identities using the repository's `.mailmap` and links GitHub makes certain.
Commit authors are now read through `.mailmap`, the way `git blame` already credited surviving lines, and two noreply addresses of one GitHub account — or a single-word name matching a noreply handle in the history — become one contributor without an alias group.
In a repository with a `.mailmap`, alias groups match the mapped addresses, so a group listing only a pre-mailmap one needs the mapped one too.
Re-run `repo-dive index` to see it — no re-scan needed.

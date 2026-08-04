---
"repo-dive": patch
---

Make `repo-dive ignore` write in each file's own style, and leave alone the files no tool needs it in.

The command used to end every ignore file with the same three lines — a blank line, a `# repo-dive catalog` comment and the entry — which is a lot of ceremony for one pattern in a file that is otherwise a plain list.
Now it reads how the file is written and follows it: the entry is slotted in at its letter in an alphabetically ordered list, appended as a bare line to a plain one, and given a comment of its own only in a file that already keeps its patterns in commented groups — with a blank line before it only where the file sets its own groups off that way.
The path itself is spelled the way the file spells paths — anchored (`/.repo-dive/`) where its paths are anchored, with a trailing slash where it marks directories that way — and a file written with `\r\n` gets a `\r\n` line.

Some ignore files also get nothing at all now, because the tool reading them already learns to skip the catalog:

- `.prettierignore`, when the repository has a root `.gitignore` — prettier reads both since v3, and the catalog is listed in `.gitignore` anyway (pinning prettier 2 or running it with `--ignore-path` opts back in);
- `.npmignore`, when `package.json` has a `files` array, which alone decides what `npm pack` includes;
- `.eslintignore`, when eslint reads a flat config, which never looks at that file.

Both `repo-dive ignore` and the warning from `scan`, `index` and `status` go by these rules, so a repository where the entry is already taken care of stays quiet.
The command now reports what each file got, or why it needed nothing.
Entries written by earlier versions are still recognized — nothing is rewritten, and re-running adds nothing.

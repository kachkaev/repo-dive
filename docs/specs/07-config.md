# Configuration file

_Implemented._

repo-insighter runs with **zero configuration**. To refine its behavior, drop a
`repo-insighter.config.ts` at the root of the **analyzed** repository (knip-style
— the config lives with the repo it describes, not with repo-insighter). `.mjs`
and `.js` are also accepted; the first match in that order wins.

```ts
import { defineConfig } from "repo-insighter/config";

export default defineConfig({
  authors: {
    aliases: [
      // Shorthand: emails only, the first entry is canonical.
      ["alice@work.example", "alice@personal.example"],
      // Rich form: a display name and a profile link the name links to.
      {
        emails: ["bob@work.example", "12345+bob@users.noreply.github.com"],
        displayName: "Bob",
        url: "https://github.com/bob",
      },
    ],
    // How many authors charts keep before folding the rest into "Other".
    maxInCharts: 10,
  },
});
```

`defineConfig` is an identity helper exported from the `repo-insighter/config`
entry point; it exists purely for type-checking and editor IntelliSense. A plain
default-exported object works too.

## Loading

The config is read by the **`index`** step (the map phase stays raw — the catalog
is never rewritten). `.ts` config relies on Node's built-in type stripping,
unflagged since Node 22.18 / 23.6; on older runtimes use a `.mjs`/`.js` config.
Malformed config fails `index` with a friendly message rather than silently
degrading.

## `authors`

### `authors.aliases`

People show up under multiple identities — work and personal email, GitHub
`noreply` addresses, name variants. A group is either a plain array of emails or
an object `{ emails, displayName?, url? }`; the **first email is canonical** and
the rest fold into it before the cube's dashboard data is built. Merging applies
to commit-count and churn attribution, the authors table, and
code-survival-by-author. An email may appear in at most one group.

Emails are matched against each commit author's email in either its raw form or
its prettified GitHub-noreply handle — so listing `alice` matches
`12345+alice@users.noreply.github.com`, i.e. you can use the handle shown in the
report.

- `displayName` overrides the name shown in the per-author charts and the
  authors table (the email column still shows the prettified canonical email).
- `url` makes that name a link (e.g. to a GitHub profile).

(Unifying AI assistant name variants through aliases is out of scope for now.)

### `authors.maxInCharts`

How many authors the per-author charts keep before folding the remainder into an
"Other" band. Defaults to `10`, must be an integer between 1 and 100. The
stacked survival-by-author area keeps up to `maxInCharts` series; the authors bar
list keeps twice that. The categorical palette provides 20 distinct colors and
cycles beyond that.

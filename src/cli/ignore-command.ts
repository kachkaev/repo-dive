import { Command, Flag } from "effect/unstable/cli";

import { runIgnore } from "./shared/ignore.ts";

export const ignoreCommand = Command.make("ignore", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository whose ignore files to update (defaults to the current directory)",
    ),
  ),
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Report what would be added without writing anything"),
  ),
}).pipe(
  Command.withDescription(
    "Add the catalog folder to the repository's ignore files (.gitignore, .prettierignore, …) so other tools skip it",
  ),
  Command.withHandler((config) =>
    runIgnore({ repoPath: config.repoPath, dryRun: config.dryRun }),
  ),
);

import { Command, Flag } from "effect/cli";

import { runIgnore } from "./ignore-command/run-ignore.ts";

export const ignoreCommand = Command.make("ignore", {
  repoPath: Flag.String("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository whose ignore files to update (defaults to the current directory)",
    ),
  ),
  dryRun: Flag.Boolean("dry-run").pipe(
    Flag.withDefault(false),
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

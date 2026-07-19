import { Command, Flag } from "effect/unstable/cli";

import { runStatus } from "../lib/status.ts";

export const statusCommand = Command.make("status", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository to inspect (defaults to the current directory)",
    ),
  ),
}).pipe(
  Command.withDescription(
    "Show how much of the repository's history has been collected into the catalog",
  ),
  Command.withHandler((config) => runStatus({ repoPath: config.repoPath })),
);

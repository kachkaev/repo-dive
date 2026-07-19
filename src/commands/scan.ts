import { Command, Flag } from "effect/unstable/cli";

import { runScan } from "../lib/scan.ts";

export const scanCommand = Command.make("scan", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository to scan (defaults to the current directory)",
    ),
  ),
}).pipe(
  Command.withDescription(
    "Print a summary of the repository's commit history (placeholder for snapshot collection, see docs/specs)",
  ),
  Command.withHandler((config) => runScan({ repoPath: config.repoPath })),
);

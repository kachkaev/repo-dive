import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { runScan } from "../lib/scan.ts";

export const scanCommand = Command.make("scan", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository to scan (defaults to the current directory)",
    ),
  ),
  collectorNames: Flag.optional(
    Flag.string("collectors").pipe(
      Flag.withDescription(
        "Comma-separated collector names to run (defaults to all built-in collectors)",
      ),
    ),
  ),
  maxCommits: Flag.optional(
    Flag.integer("max-commits").pipe(
      Flag.withDescription(
        "Only scan the newest N commits (useful for a quick first pass)",
      ),
    ),
  ),
}).pipe(
  Command.withDescription(
    "Collect raw per-commit snapshots into the catalog (resumable; already-collected commits are skipped)",
  ),
  Command.withHandler((config) =>
    runScan({
      repoPath: config.repoPath,
      collectorNames: Option.getOrUndefined(config.collectorNames),
      maxCommits: Option.getOrUndefined(config.maxCommits),
    }),
  ),
);

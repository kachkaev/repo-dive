import { Option } from "effect";
import { Command, Flag } from "effect/cli";

import { runGc } from "./gc-command/run-gc.ts";

export const gcCommand = Command.make("gc", {
  repoPath: Flag.String("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository whose catalog to clean (defaults to the current directory)",
    ),
  ),
  unreachable: Flag.Boolean("unreachable").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Remove data for commits no longer reachable from HEAD",
    ),
  ),
  offMainline: Flag.Boolean("off-mainline").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Remove tree snapshots stored under commits that are not on HEAD's first-parent chain",
    ),
  ),
  stale: Flag.Boolean("stale").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Remove catalog outputs and blob-cache entries written by old collector versions or by collectors that no longer exist",
    ),
  ),
  collectorNames: Flag.optional(
    Flag.String("collectors").pipe(
      Flag.withDescription(
        "Comma-separated collector names whose outputs should be removed entirely",
      ),
    ),
  ),
  dryRun: Flag.Boolean("dry-run").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Report what would be removed without removing it"),
  ),
  yes: Flag.Boolean("yes").pipe(
    Flag.withDefault(false),
    Flag.withAlias("y"),
    Flag.withDescription("Skip the confirmation prompt"),
  ),
}).pipe(
  Command.withDescription(
    "Garbage-collect the catalog: unreachable commits, off-mainline snapshots, stale versions or whole collectors (interactive without flags)",
  ),
  Command.withHandler((config) =>
    runGc({
      repoPath: config.repoPath,
      unreachable: config.unreachable,
      offMainline: config.offMainline,
      stale: config.stale,
      collectorNames: Option.getOrUndefined(config.collectorNames),
      dryRun: config.dryRun,
      yes: config.yes,
    }),
  ),
);

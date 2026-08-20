import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Data, Effect, Runtime } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";

import packageJson from "../package.json" with { type: "json" };
import { collectorsCommand } from "./cli/collectors-command.ts";
import { dashboardCommand } from "./cli/dashboard-command.ts";
import { gcCommand } from "./cli/gc-command.ts";
import { ignoreCommand } from "./cli/ignore-command.ts";
import { indexCommand } from "./cli/index-command.ts";
import { mcpCommand } from "./cli/mcp-command.ts";
import { queryCommand } from "./cli/query-command.ts";
import { reportCommand } from "./cli/report-command.ts";
import { scanCommand } from "./cli/scan-command.ts";
import { defaultDashboardPort } from "./cli/shared/config.ts";
import { runDashboard } from "./cli/shared/dashboard-server.ts";
import { runIndex } from "./cli/shared/indexing.ts";
import { runScan } from "./cli/shared/scan.ts";
import { statusCommand } from "./cli/status-command.ts";

const cli = Command.make("repo-dive", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository to analyze (defaults to the current directory)",
    ),
  ),
  port: Flag.integer("port").pipe(
    Flag.withDefault(defaultDashboardPort),
    Flag.withDescription("Port to serve the dashboard on"),
  ),
  open: Flag.boolean("open").pipe(
    Flag.withDefault(true),
    Flag.withDescription(
      "Open the dashboard in the default browser (default: --open; pass --no-open to disable)",
    ),
  ),
}).pipe(
  Command.withDescription(
    "Derive insights from a git repository's history. " +
      "Without a subcommand, runs the whole pipeline: scan → index → dashboard.",
  ),
  Command.withHandler((config) =>
    Effect.gen(function* () {
      yield* Console.log("Step 1/3 — scan: collecting per-commit snapshots…");
      yield* runScan({ repoPath: config.repoPath });
      yield* Console.log("\nStep 2/3 — index: rolling up the metrics cube…");
      yield* runIndex({ repoPath: config.repoPath });
      yield* Console.log("\nStep 3/3 — dashboard:");
      yield* runDashboard({
        repoPath: config.repoPath,
        port: config.port,
        open: config.open,
      });
    }),
  ),
  Command.withSubcommands([
    scanCommand,
    indexCommand,
    dashboardCommand,
    reportCommand,
    queryCommand,
    mcpCommand,
    statusCommand,
    collectorsCommand,
    gcCommand,
    ignoreCommand,
  ]),
);

/**
 * Failure that {@link NodeRuntime.runMain} must not log again: the message has
 * already been printed to stderr (see `Runtime.errorReported`). The process
 * still exits non-zero.
 */
class ReportedCliFailure extends Data.TaggedError("ReportedCliFailure") {
  override readonly [Runtime.errorReported] = false;
}

Command.run(cli, { version: packageJson.version }).pipe(
  // Domain failures print as one friendly line on stderr. CLI-internal errors
  // (--help rendering, Ctrl-C quits) keep the framework's own handling and
  // exit codes.
  Effect.catchIf(
    (error) => !CliError.isCliError(error),
    (error) =>
      Console.error(
        error instanceof Error ? error.message : String(error),
      ).pipe(Effect.andThen(Effect.fail(new ReportedCliFailure()))),
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);

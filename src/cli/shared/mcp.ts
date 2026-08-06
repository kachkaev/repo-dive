import { NodeStdio } from "@effect/platform-node";
import { Effect, Layer, Logger, Schema } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/unstable/ai";
import type { ChildProcessSpawner } from "effect/unstable/process";

import packageJson from "../../../package.json" with { type: "json" };
import { loadConfig } from "./config.ts";
import { query, QueryError } from "./query.ts";
import { resolveRepoRoot } from "./scan.ts";

const queryTool = Tool.make("query", {
  description:
    "Run a read-only SQL query (SELECT/WITH/EXPLAIN) against the repository's metrics cube. " +
    "Tables: commits (sha, authored_at, committed_at, author_email, author_name) and facts " +
    "(commit_sha, collector, metric, value, categories as a JSON object usable via json_extract). " +
    "Returns { columns, rows, truncated }.",
  parameters: Schema.Struct({ sql: Schema.String }),
  success: Schema.Unknown,
  failure: QueryError,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const schemaTool = Tool.make("schema", {
  description:
    "Describe the repository's metrics cube: tables, available metrics with row counts, " +
    "sample category keys per metric, and the commit range. Call this before writing queries.",
  parameters: Schema.Struct({}),
  success: Schema.Unknown,
  failure: QueryError,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const buildSchemaDescription = (
  catalogPath: string,
): Effect.Effect<unknown, QueryError> =>
  Effect.gen(function* () {
    const metrics = yield* query(
      catalogPath,
      `SELECT metric, count(*) AS facts, min(value) AS min_value, max(value) AS max_value
     FROM facts GROUP BY metric ORDER BY metric`,
    );
    const categorySamples = yield* query(
      catalogPath,
      `SELECT metric, categories FROM facts
     WHERE id IN (SELECT min(id) FROM facts GROUP BY metric)`,
    );
    const commitRange = yield* query(
      catalogPath,
      "SELECT count(*) AS commits, min(authored_at) AS first, max(committed_at) AS last FROM commits",
    );

    return {
      tables: {
        commits: [
          "sha",
          "authored_at",
          "committed_at",
          "author_email",
          "author_name",
        ],
        facts: [
          "id",
          "commit_sha",
          "collector",
          "metric",
          "value",
          "categories (JSON object; use json_extract(categories, '$.key'))",
        ],
      },
      commitRange: commitRange.rows[0],
      metrics: metrics.rows,
      categoryKeySamples: categorySamples.rows,
      hints: [
        "Join facts to commits via commit_sha to plot anything over time.",
        "Pick the date by the shape of the question. Measuring the tree at points in time (languages.*, files.*, dependencies.*, directives.*, survival.lines totals)? Order by committed_at — authored_at can run months behind and does not increase along the history, so a rebased repo plots as a zigzag. Counting commits or lines of work per day/month/author? Bucket by authored_at — that is when the work was done, and it is the clock survival's cohort category is already on.",
        "categories is open-ended: keys differ per metric (language, extension, author, rule, cohort, …).",
        "Sampled collectors (languages.*, survival.*) only have facts at sampled commits.",
      ],
    };
  });

const mcpToolkit = Toolkit.make(queryTool, schemaTool);

/**
 * Serves the metrics cube over the Model Context Protocol (stdio), so AI
 * agents can explore a scanned repository by asking SQL questions.
 */
export const buildMcpLayer = (
  repoPath: string,
): Effect.Effect<
  Layer.Layer<never, Error>,
  Error,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const { catalogPath } = yield* loadConfig(repoRoot);

    // Fail fast (before the protocol starts) if the cube is missing.
    yield* query(catalogPath, "SELECT 1");

    // Declared `failure` schemas make the server report handler failures as
    // proper MCP tool errors (isError: true), so handlers just fail.
    const handlers = mcpToolkit.toLayer({
      query: ({ sql }) =>
        query(catalogPath, sql, 200).pipe(
          Effect.map((result): unknown => ({
            columns: result.columns,
            rows: result.rows,
            truncated: result.truncated,
          })),
        ),
      schema: () => buildSchemaDescription(catalogPath),
    });

    return McpServer.toolkit(mcpToolkit).pipe(
      Layer.provide(handlers),
      Layer.provide(
        McpServer.layerStdio({
          name: "repo-dive",
          version: packageJson.version,
          protocols: [McpProtocol.v2025_06_18],
        }),
      ),
      Layer.provide(NodeStdio.layer),
      // stdout carries the protocol; keep logs on stderr.
      Layer.provide(Layer.succeed(Logger.LogToStderr)(true)),
    );
  });

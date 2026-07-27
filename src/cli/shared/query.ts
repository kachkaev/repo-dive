import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Console, Effect, Schema } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { loadConfig } from "./config.ts";
import { resolveRepoRoot } from "./scan.ts";

/**
 * Failure of a metrics-cube query. Schema-backed so it can cross the MCP
 * serialization boundary (see {@link ./mcp.ts}).
 */
export class QueryError extends Schema.TaggedErrorClass<QueryError>()(
  "QueryError",
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

export type QueryResult = {
  readonly columns: readonly string[];
  readonly rows: ReadonlyArray<Record<string, unknown>>;
  readonly truncated: boolean;
};

/**
 * Runs one read-only SQL statement against the repository's metrics cube.
 * The database is opened read-only, and only SELECT-shaped statements are
 * accepted, so the cube can never be mutated through this path.
 */
const executeQuery = (
  catalogPath: string,
  sql: string,
  maxRows = 1000,
): QueryResult => {
  const dbPath = path.join(catalogPath, "index", "metrics.sqlite");
  if (!existsSync(dbPath)) {
    throw new Error(
      `No metrics cube at ${dbPath} — run \`repo-dive scan\` and \`repo-dive index\` first.`,
    );
  }
  if (!/^\s*(?:select|with|explain)\b/i.test(sql)) {
    throw new Error(
      "Only read-only queries are supported (SELECT, WITH or EXPLAIN).",
    );
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const allRows = db.prepare(sql).all();
    const truncated = allRows.length > maxRows;
    const rows = allRows
      .slice(0, maxRows)
      .map((row) => Object.fromEntries(Object.entries(row)));
    const firstRow = rows[0];
    return {
      columns: firstRow ? Object.keys(firstRow) : [],
      rows,
      truncated,
    };
  } finally {
    db.close();
  }
};

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  // SQLite cells are otherwise numbers, bigints or Uint8Array blobs.
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return value.toString();
  }
  return JSON.stringify(value);
};

const formatTable = (result: QueryResult): string => {
  if (result.rows.length === 0) {
    return "(no rows)";
  }
  const widths = result.columns.map((column) =>
    Math.max(
      column.length,
      ...result.rows.map((row) => formatCell(row[column]).length),
    ),
  );
  const line = (cells: readonly string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ");
  return [
    line(result.columns),
    line(widths.map((width) => "-".repeat(width))),
    ...result.rows.map((row) =>
      line(result.columns.map((column) => formatCell(row[column]))),
    ),
    ...(result.truncated ? ["… (truncated)"] : []),
  ].join("\n");
};

/** {@link executeQuery} lifted into Effect with a typed failure. */
export const query = (
  catalogPath: string,
  sql: string,
  maxRows?: number,
): Effect.Effect<QueryResult, QueryError> =>
  Effect.try({
    try: () => executeQuery(catalogPath, sql, maxRows),
    catch: (cause) =>
      new QueryError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });

export const runQuery = ({
  repoPath,
  sql,
  json,
}: {
  readonly repoPath: string;
  readonly sql: string;
  readonly json: boolean;
}): Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const { catalogPath } = yield* loadConfig(repoRoot);
    const result = yield* query(catalogPath, sql);
    yield* Console.log(
      json ? JSON.stringify(result.rows, undefined, 2) : formatTable(result),
    );
  });

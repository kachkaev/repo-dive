import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Console, Data, Effect, type PlatformError, type Scope } from "effect";
import { Flag } from "effect/cli";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";

import { loadConfig } from "./config.ts";
import { resolveRepoRoot } from "./scan.ts";

export class DashboardUnavailableError extends Data.TaggedError(
  "DashboardUnavailableError",
)<{
  readonly reason: string;
}> {
  override get message(): string {
    return this.reason;
  }
}

class ServerListenError extends Data.TaggedError("ServerListenError")<{
  readonly port: number;
  readonly cause: Error;
}> {
  override get message(): string {
    return `Unable to listen on port ${this.port}: ${this.cause.message}`;
  }
}

const mimeTypes: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
};

/**
 * Which build of the dashboard to serve or export. Both read the same
 * dashboard.json: `react` is the dashboard itself, `effect` an experimental
 * port to Effect UI that lives in dashboard-effect-ui/ and is built next to it.
 */
export type DashboardUi = "react" | "effect";

/** The `--ui` flag, shared by every command that serves or exports the dashboard. */
export const dashboardUiFlag = Flag.Literals("ui", ["react", "effect"]).pipe(
  Flag.withDefault("react"),
  Flag.withDescription(
    "Which dashboard to use: react, or effect for the experimental Effect UI port (default: react)",
  ),
);

/** The build of each dashboard implementation, as a folder of dist/. */
const assetsDirNames: Record<DashboardUi, string> = {
  react: "dashboard",
  effect: "dashboard-effect-ui",
};

/** Bundled build: dist/cli.js + dist/dashboard/. Dev: src/cli/shared/… + dist/dashboard/. */
export const resolveAssetsDir = (ui: DashboardUi): string | undefined => {
  const dirName = assetsDirNames[ui];
  const candidates = [
    fileURLToPath(new URL(dirName, import.meta.url)),
    fileURLToPath(new URL(`../../../dist/${dirName}`, import.meta.url)),
  ];
  return candidates.find((candidate) =>
    existsSync(path.join(candidate, "index.html")),
  );
};

export const assetsUnavailableError = (
  ui: DashboardUi,
): DashboardUnavailableError =>
  new DashboardUnavailableError({
    reason: `Dashboard assets not found — run \`pnpm build\` first (dist/${assetsDirNames[ui]} is missing).`,
  });

export const openInBrowser = Effect.fn("openInBrowser")(
  function* (
    url: string,
  ): Effect.fn.Return<
    void,
    PlatformError.PlatformError,
    ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
  > {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    const handle = yield* ChildProcess.make(command, [url], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    yield* handle.exitCode;
  },
  Effect.scoped,
  Effect.ignore(),
);

export const runDashboard = Effect.fn("runDashboard")(function* ({
  repoPath,
  port,
  open,
  ui,
}: {
  readonly repoPath: string;
  readonly port: number;
  readonly open: boolean;
  readonly ui: DashboardUi;
}): Effect.fn.Return<void, Error, ChildProcessSpawner.ChildProcessSpawner> {
  const repoRoot = yield* resolveRepoRoot(repoPath);
  const config = yield* loadConfig(repoRoot);
  const dataPath = path.join(config.catalogPath, "index", "dashboard.json");
  if (!existsSync(dataPath)) {
    return yield* new DashboardUnavailableError({
      reason: `No dashboard data at ${dataPath} — run \`repo-dive scan\` and \`repo-dive index\` first.`,
    });
  }

  const assetsDir = resolveAssetsDir(ui);
  if (assetsDir === undefined) {
    return yield* assetsUnavailableError(ui);
  }

  const server = http.createServer((request, response) => {
    void (async () => {
      const requestPath = new URL(request.url ?? "/", "http://localhost")
        .pathname;

      try {
        if (requestPath === "/dashboard.json") {
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          response.end(await readFile(dataPath));
          return;
        }

        const relativePath = requestPath === "/" ? "index.html" : requestPath;
        const filePath = path.join(assetsDir, relativePath);
        // Keep requests inside the assets dir; anything else gets the app shell.
        const safePath =
          filePath.startsWith(assetsDir) && existsSync(filePath)
            ? filePath
            : path.join(assetsDir, "index.html");

        response.writeHead(200, {
          "content-type":
            mimeTypes[path.extname(safePath)] ?? "application/octet-stream",
        });
        response.end(await readFile(safePath));
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(String(error));
      }
    })();
  });

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- the callback effect genuinely succeeds with no value
  yield* Effect.callback<void, ServerListenError>((resume) => {
    server.on("error", (error) => {
      resume(Effect.fail(new ServerListenError({ port, cause: error })));
    });
    server.listen(port, () => {
      resume(Effect.void);
    });
  });

  const url = `http://localhost:${port}`;
  yield* Console.log(
    `Dashboard for ${repoRoot}\nServing on ${url} — press Ctrl+C to stop.`,
  );

  if (open) {
    yield* openInBrowser(url);
  }

  // Keep the process alive until interrupted.
  yield* Effect.never;
});

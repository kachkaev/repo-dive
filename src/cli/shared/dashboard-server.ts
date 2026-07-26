import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Console, Data, Effect } from "effect";
import {
  ChildProcess,
  type ChildProcessSpawner,
} from "effect/unstable/process";

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

/** Bundled build: dist/cli.js + dist/dashboard/. Dev: src/cli/shared/… + dist/dashboard/. */
export const resolveAssetsDir = (): string | undefined => {
  const candidates = [
    fileURLToPath(new URL("dashboard", import.meta.url)),
    fileURLToPath(new URL("../../../dist/dashboard", import.meta.url)),
  ];
  return candidates.find((candidate) =>
    existsSync(path.join(candidate, "index.html")),
  );
};

export const openInBrowser = (
  url: string,
): Effect.Effect<void, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function* () {
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
    }),
  ).pipe(Effect.ignore);

export const runDashboard = ({
  repoPath,
  port,
  open,
}: {
  readonly repoPath: string;
  readonly port: number;
  readonly open: boolean;
}): Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const config = yield* loadConfig(repoRoot);
    const dataPath = path.join(config.catalogPath, "index", "dashboard.json");
    if (!existsSync(dataPath)) {
      return yield* new DashboardUnavailableError({
        reason: `No dashboard data at ${dataPath} — run \`repo-dive scan\` and \`repo-dive index\` first.`,
      });
    }

    const assetsDir = resolveAssetsDir();
    if (assetsDir === undefined) {
      return yield* new DashboardUnavailableError({
        reason:
          "Dashboard assets not found — run `pnpm build` first (dist/dashboard is missing).",
      });
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

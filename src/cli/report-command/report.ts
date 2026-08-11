import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Console, Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { loadConfig } from "../shared/config.ts";
import {
  DashboardUnavailableError,
  openInBrowser,
  resolveAssetsDir,
} from "../shared/dashboard-server.ts";
import { resolveRepoRoot } from "../shared/scan.ts";

/**
 * Builds a single self-contained report.html: the dashboard bundle with CSS,
 * JS and the repository's dashboard.json inlined — shareable without running
 * anything.
 */
export const runReport = ({
  repoPath,
  outPath,
  open,
}: {
  readonly repoPath: string;
  readonly outPath?: string | undefined;
  readonly open: boolean;
}): Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const { catalogPath } = yield* loadConfig(repoRoot);
    const dataPath = path.join(catalogPath, "index", "dashboard.json");
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

    const html = yield* Effect.tryPromise(async () => {
      const [indexHtml, dataJson] = await Promise.all([
        readFile(path.join(assetsDir, "index.html"), "utf8"),
        readFile(dataPath, "utf8"),
      ]);

      // "</script>" inside the JSON payload would terminate the inline tag.
      const safeData = dataJson.replaceAll("</", String.raw`<\/`);
      const dataTag = `<script>window.__REPO_DIVE_DATA__ = ${safeData};</script>`;

      let result = indexHtml;

      const styleMatches = [
        ...result.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
      ];
      for (const match of styleMatches) {
        const css = await readFile(
          path.join(assetsDir, match[1] ?? ""),
          "utf8",
        );
        result = result.replace(match[0], () => `<style>${css}</style>`);
      }

      const scriptMatches = [
        ...result.matchAll(
          /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
        ),
      ];
      for (const match of scriptMatches) {
        const js = await readFile(path.join(assetsDir, match[1] ?? ""), "utf8");
        const safeJs = js.replaceAll("</script", String.raw`<\/script`);
        // A replacer function keeps "$"-sequences in the bundle literal.
        result = result.replace(
          match[0],
          () => `${dataTag}<script type="module">${safeJs}</script>`,
        );
      }

      return result;
    });

    const resolvedOutPath =
      outPath ?? path.join(catalogPath, "index", "report.html");
    yield* Effect.tryPromise(() => writeFile(resolvedOutPath, html, "utf8"));

    yield* Console.log(
      `Report written to ${resolvedOutPath} (${Math.round(html.length / 1024)} kB, self-contained).`,
    );

    if (open) {
      yield* openInBrowser(resolvedOutPath);
    }
  });

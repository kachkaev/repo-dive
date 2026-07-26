import { Effect } from "effect";

import { numberAt, recordAt } from "../../../shared/json.ts";
import { languageOfExtension } from "../languages.ts";
import { scanTreeWithBlobCache } from "./shared/tree-scan.ts";
import { type Collector, extensionOf, type Fact } from "./shared/types.ts";

type ExtensionStats = {
  files: number;
  lines: number;
};

export type LanguagesOutput = {
  /**
   * Keyed by extension rather than language so the extension → language map can
   * be corrected by re-running `index` alone: normalization is cheap and
   * re-runnable, collection is not.
   */
  readonly byExtension: Record<string, ExtensionStats>;
  readonly totalLines: number;
  readonly totalFiles: number;
};

/**
 * Physical lines in one file, counted the way `git blame` attributes them: a
 * final line without a trailing newline still counts, an empty file has none.
 * Matching blame is what lets the dashboard's "Lines by language" chart show
 * the same totals with age shading on and off.
 */
export const countLines = (content: string): number => {
  if (content === "") {
    return 0;
  }
  const newlines = content.split("\n").length - 1;
  return content.endsWith("\n") ? newlines : newlines + 1;
};

export const summarizeLineCounts = (
  files: ReadonlyArray<{ filePath: string; result: unknown }>,
): LanguagesOutput => {
  const byExtension: Record<string, ExtensionStats> = {};
  let totalLines = 0;
  let totalFiles = 0;

  for (const file of files) {
    const lines = typeof file.result === "number" ? file.result : 0;
    const bucket = (byExtension[extensionOf(file.filePath)] ??= {
      files: 0,
      lines: 0,
    });
    bucket.files += 1;
    bucket.lines += lines;
    totalFiles += 1;
    totalLines += lines;
  }

  return { byExtension, totalLines, totalFiles };
};

export const languagesCollector: Collector = {
  name: "languages",
  description:
    "Lines and file count per language across a commit's source files",
  // 1 → 2: the tokei shell-out gave way to an in-process count over the same
  // source files the blame-based survival collector scans. Outputs written by
  // version 1 counted lockfiles, minified bundles and data blobs, so they must
  // not survive a re-scan.
  version: "2",
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, catalogPath, sha, cacheKey }) =>
    scanTreeWithBlobCache({
      repoRoot,
      catalogPath,
      sha,
      collectorName: "languages",
      cacheKey,
      scanContent: countLines,
    }).pipe(Effect.map(summarizeLineCounts)),
  normalize: (raw) => {
    const byLanguage: Record<string, ExtensionStats> = {};
    for (const [extension, stats] of Object.entries(
      recordAt(raw, "byExtension"),
    )) {
      const language = languageOfExtension(extension);
      const bucket = (byLanguage[language] ??= { files: 0, lines: 0 });
      bucket.files += numberAt(stats, "files");
      bucket.lines += numberAt(stats, "lines");
    }

    const facts: Fact[] = [];
    for (const [language, stats] of Object.entries(byLanguage)) {
      facts.push(
        {
          metric: "languages.lines",
          value: stats.lines,
          categories: { language },
        },
        {
          metric: "languages.files",
          value: stats.files,
          categories: { language },
        },
      );
    }
    return facts;
  },
};

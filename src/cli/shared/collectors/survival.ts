import { Effect } from "effect";

import { listTreeBlobs, runGit } from "../git.ts";
import { encodePathRows, normalizePathRows } from "./shared/path-rows.ts";
import { maxBlobBytes } from "./shared/tree-scan.ts";
import { cohortMonthOf, type Collector } from "./shared/types.ts";

type LineAttribution = {
  readonly authorEmail: string;
  readonly cohortMonth: string;
};

/**
 * Parses `git blame --line-porcelain` output into one attribution per line.
 * Porcelain repeats full headers per line, so author-mail/author-time always
 * precede the tab-prefixed content line they describe.
 */
export const parseBlamePorcelain = (stdout: string): LineAttribution[] => {
  const attributions: LineAttribution[] = [];
  let authorEmail = "";
  let authorTime = 0;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("author-mail ")) {
      authorEmail = line.slice("author-mail ".length).replaceAll(/^<|>$/g, "");
    } else if (line.startsWith("author-time ")) {
      authorTime = Number(line.slice("author-time ".length));
    } else if (line.startsWith("\t")) {
      attributions.push({
        authorEmail,
        cohortMonth: cohortMonthOf(authorTime),
      });
    }
  }

  return attributions;
};

const fieldSeparator = "\u{1F}";

/**
 * Tallies one commit's blame results per file, author and cohort. A binary file
 * has no lines to attribute, wherever a config rule sends it.
 */
export const summarizeBlames = (
  blames: ReadonlyArray<{ filePath: string; stdout: string }>,
) => {
  const counts = new Map<string, number>();
  let totalLines = 0;
  for (const { filePath, stdout } of blames) {
    if (stdout.includes("\0")) {
      continue;
    }
    for (const attribution of parseBlamePorcelain(stdout)) {
      const key = [
        filePath,
        attribution.authorEmail,
        attribution.cohortMonth,
      ].join(fieldSeparator);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      totalLines += 1;
    }
  }
  return {
    ...encodePathRows(
      counts
        .entries()
        .map(([key, count]) => {
          const [filePath = "", authorEmail = "", cohortMonth = ""] =
            key.split(fieldSeparator);
          return { filePath, authorEmail, cohortMonth, count };
        })
        .toArray(),
    ),
    totalLines,
    fileCount: blames.length,
  };
};

export const survivalCollector: Collector = {
  name: "survival",
  description:
    "Line survival via git blame: living lines by file, author and age cohort (sampled monthly by default; expensive)",
  // 1 → 2: rows hold file paths rather than extensions, so that `index` can
  // tell the purposes of the files.
  version: "2",
  strategy: "tree",
  scansSourceFiles: true,
  defaultSampling: "monthly",
  collect: Effect.fnUntraced(function* ({ repoRoot, sha, isSourceFile }) {
    const blobs = yield* listTreeBlobs(repoRoot, sha);
    const files = blobs
      .filter(
        (blob) => isSourceFile(blob.filePath) && blob.sizeBytes <= maxBlobBytes,
      )
      .map((blob) => blob.filePath);

    const blames = yield* Effect.forEach(
      files,
      (filePath) =>
        runGit([
          "-C",
          repoRoot,
          "blame",
          "--line-porcelain",
          "-w",
          sha,
          "--",
          filePath,
        ]).pipe(Effect.map((stdout) => ({ filePath, stdout }))),
      { concurrency: 8 },
    );

    return summarizeBlames(blames);
  }),
  normalize: (raw, context) =>
    normalizePathRows({
      raw,
      metric: "survival.lines",
      legacyValueKey: "lines",
      context,
      sourceFilesOnly: true,
    }),
};

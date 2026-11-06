import { Effect } from "effect";

import { listTreeBlobs, runGit, type TreeBlob } from "../git.ts";
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
 * Lines per author and cohort in one file's blame. Tallied per file because a
 * whole tree's raw blame output outgrows the heap on a large repository once a
 * few samples run concurrently. A binary file has no lines to attribute,
 * wherever a config rule sends it.
 */
export const tallyBlame = (stdout: string): ReadonlyMap<string, number> => {
  const tally = new Map<string, number>();
  if (!stdout.includes("\0")) {
    for (const { authorEmail, cohortMonth } of parseBlamePorcelain(stdout)) {
      const key = `${authorEmail}${fieldSeparator}${cohortMonth}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  return tally;
};

export const summarizeBlames = (
  files: ReadonlyArray<{
    filePath: string;
    tally: ReadonlyMap<string, number>;
  }>,
) => {
  const rows = files.flatMap(({ filePath, tally }) =>
    tally
      .entries()
      .map(([key, count]) => {
        const [authorEmail = "", cohortMonth = ""] = key.split(fieldSeparator);
        return { filePath, authorEmail, cohortMonth, count };
      })
      .toArray(),
  );
  return {
    ...encodePathRows(rows),
    totalLines: rows.reduce((total, row) => total + row.count, 0),
    fileCount: files.length,
  };
};

/**
 * What can be blamed of a commit's tree. A path that is not valid UTF-8 reaches
 * us with a replacement character in it, naming no file `git blame` could find,
 * and one such failure would lose the commit's whole sample; the file still
 * counts as a file, through `file-survival`.
 */
export const selectBlameableFiles = (
  blobs: readonly TreeBlob[],
  isSourceFile: (filePath: string) => boolean,
): string[] =>
  blobs
    .filter(
      (blob) =>
        isSourceFile(blob.filePath) &&
        blob.sizeBytes <= maxBlobBytes &&
        !blob.filePath.includes("\u{FFFD}"),
    )
    .map((blob) => blob.filePath);

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
    const files = selectBlameableFiles(
      yield* listTreeBlobs(repoRoot, sha),
      isSourceFile,
    );

    const tallies = yield* Effect.forEach(
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
        ]).pipe(
          Effect.map((stdout) => ({ filePath, tally: tallyBlame(stdout) })),
        ),
      { concurrency: 8 },
    );

    return summarizeBlames(tallies);
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

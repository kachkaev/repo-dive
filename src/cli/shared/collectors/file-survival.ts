import { Effect } from "effect";

import { arrayAt, numberAt, stringAt } from "../../../shared/json.ts";
import { runGit } from "../git.ts";
import {
  cohortMonthOf,
  type Collector,
  extensionOf,
  type Fact,
  isScannableSourceFile,
} from "./shared/types.ts";

type FileSurvivalRow = {
  readonly extension: string;
  /** Author of the commit that created the file. */
  readonly authorEmail: string;
  /** YYYY-MM the creating commit was authored — the file's age cohort. */
  readonly cohortMonth: string;
  readonly files: number;
};

type FileSurvivalOutput = {
  readonly rows: readonly FileSurvivalRow[];
  readonly totalFiles: number;
};

/** Between the fields of one commit header in the log stream. */
const fieldSeparator = "";
/** Before each commit record in the log stream. */
const recordSeparator = "";

type FileOrigin = {
  readonly authorEmail: string;
  readonly cohortMonth: string;
};

/**
 * Resolves each present file to the commit that created it, from one
 * `git log --name-status` stream over the history below the snapshot
 * (newest first, `--format=%x1E%ae%x1F%at`).
 *
 * The walk keeps a map from a path *as history spelled it at that point* to
 * the present-day paths it became. An `A` entry is the creation event for
 * whatever that path currently traces; an `R old new` entry re-keys the trace
 * from `new` to `old`, so a rename chain resolves to the original creation
 * rather than restarting the file's life — later edits never re-bin a file
 * either, because only `A`/`R` entries are read at all. Renames of one commit
 * are applied as a batch: `a→b` and `c→a` in the same commit must both re-key
 * against the pre-commit names.
 *
 * A file whose creation the walk never meets (a history boundary, or a rename
 * past git's detection limit inside a merge) stays unresolved and is simply
 * absent from the returned map.
 */
export const resolveFileOrigins = (
  stdout: string,
  presentFiles: readonly string[],
): Map<string, FileOrigin> => {
  const origins = new Map<string, FileOrigin>();
  /** Path as spelled at this point of the walk → present-day paths it became. */
  const pending = new Map<string, string[]>();
  for (const filePath of presentFiles) {
    pending.set(filePath, [filePath]);
  }

  for (const record of stdout.split(recordSeparator)) {
    if (pending.size === 0) {
      break;
    }
    const lines = record.split("\n");
    const [authorEmail = "", authorTimeRaw = ""] = (lines[0] ?? "").split(
      fieldSeparator,
    );
    const authorTime = Number(authorTimeRaw);
    if (!Number.isFinite(authorTime)) {
      continue;
    }
    const origin: FileOrigin = {
      authorEmail,
      cohortMonth: cohortMonthOf(authorTime),
    };

    /** This commit's renames, applied after its entries so they re-key atomically. */
    const renamedTo = new Map<string, string[]>();
    for (const line of lines.slice(1)) {
      const [status = "", ...paths] = line.split("\t");
      // `A` creates its path; a copy (`C old new`, when copy detection is on)
      // creates its target too — either resolves the trace ending here.
      const createdPath = status === "A" ? paths[0] : undefined;
      const copiedPath = status.startsWith("C") ? paths[1] : undefined;
      const resolvedPath = createdPath ?? copiedPath;
      if (resolvedPath !== undefined) {
        const targets = pending.get(resolvedPath);
        if (targets) {
          for (const target of targets) {
            origins.set(target, origin);
          }
          pending.delete(resolvedPath);
        }
      } else if (status.startsWith("R")) {
        const [oldPath, newPath] = paths;
        if (oldPath === undefined || newPath === undefined) {
          continue;
        }
        const targets = pending.get(newPath);
        if (targets) {
          pending.delete(newPath);
          renamedTo.set(oldPath, [
            ...(renamedTo.get(oldPath) ?? []),
            ...targets,
          ]);
        }
      }
    }
    for (const [oldPath, targets] of renamedTo) {
      pending.set(oldPath, [...(pending.get(oldPath) ?? []), ...targets]);
    }
  }

  return origins;
};

/**
 * When a file was created and by whom, for every source file alive at a
 * commit. The granular sibling of `survival`: where that collector asks which
 * *lines* still live, this one only asks whether the *file* still exists —
 * edits after creation neither re-attribute a file nor move it to a newer
 * cohort, and only a deletion ends it.
 *
 * Emits into the `survival.*` metric namespace on purpose: `survival.lines`
 * and `survival.files` are two grains of the same question, and the dashboard
 * draws them with the same machinery. Collected separately so bumping either
 * collector's version does not invalidate the other's outputs (blame is far
 * more expensive than this log walk).
 */
export const fileSurvivalCollector: Collector = {
  name: "file-survival",
  description:
    "File survival via git log: living files by extension, creator and creation cohort, renames followed (sampled monthly by default)",
  version: "1",
  strategy: "tree",
  defaultSampling: "monthly",
  collect: ({ repoRoot, sha }) =>
    Effect.gen(function* () {
      const fileList = yield* runGit([
        "-C",
        repoRoot,
        "ls-tree",
        "-r",
        "--name-only",
        sha,
      ]);
      const files = fileList.split("\n").filter(isScannableSourceFile);

      // One pass over the history reachable from the snapshot. `--topo-order`
      // keeps children ahead of parents, so of a delete-and-recreate pair the
      // walk meets the recreation first — the lifetime the present file
      // belongs to. Merges list no files (the creating non-merge commit is
      // reachable anyway, and it is the one that names the author); `-M`
      // pairs renames so a moved file keeps its origin.
      const log = yield* runGit([
        "-C",
        repoRoot,
        "log",
        "--topo-order",
        "-M",
        "--name-status",
        `--format=${recordSeparator}%ae${fieldSeparator}%at`,
        sha,
      ]);
      const origins = resolveFileOrigins(log, files);

      const counts = new Map<string, number>();
      for (const filePath of files) {
        // An unresolved origin (history boundary, undetected rename) keeps the
        // file counted — it exists — under empty attribution.
        const origin = origins.get(filePath);
        const key = [
          extensionOf(filePath),
          origin?.authorEmail ?? "",
          origin?.cohortMonth ?? "",
        ].join(fieldSeparator);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const rows: FileSurvivalRow[] = [...counts.entries()].map(
        ([key, fileCount]) => {
          const [extension = "", authorEmail = "", cohortMonth = ""] =
            key.split(fieldSeparator);
          return { extension, authorEmail, cohortMonth, files: fileCount };
        },
      );

      return { rows, totalFiles: files.length } satisfies FileSurvivalOutput;
    }),
  normalize: (raw) => {
    const facts: Fact[] = [];
    for (const row of arrayAt(raw, "rows")) {
      facts.push({
        metric: "survival.files",
        value: numberAt(row, "files"),
        categories: {
          extension: stringAt(row, "extension"),
          author: stringAt(row, "authorEmail"),
          cohort: stringAt(row, "cohortMonth"),
        },
      });
    }
    return facts;
  },
};

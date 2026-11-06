import { arrayAt, numberAt, stringAt } from "../../../../shared/json.ts";
import { extensionOf } from "../../languages.ts";
import type { Fact, NormalizeContext } from "./types.ts";

/**
 * Survival units attributed to one file: path, author and cohort, plus how many
 * units (lines or files) that combination holds.
 */
type PathRow = {
  readonly filePath: string;
  readonly authorEmail: string;
  readonly cohortMonth: string;
  readonly count: number;
};

const tableOf = (values: readonly string[]) => {
  const table = [...new Set(values)];
  return {
    table,
    positions: new Map(table.map((value, index) => [value, index])),
  };
};

/**
 * How survival collectors store their output: one row per file and attribution,
 * with paths and authors in lookup tables. Keeping paths in the raw output is
 * what lets `index` apply the file purpose rules; the tables keep it about the
 * size the per-extension totals it replaced took up, pretty-printed as those
 * were (376 KB against 413 KB for a snapshot of vite).
 */
export const encodePathRows = (rows: readonly PathRow[]) => {
  const paths = tableOf(rows.map((row) => row.filePath));
  const authors = tableOf(rows.map((row) => row.authorEmail));
  return {
    paths: paths.table,
    authors: authors.table,
    rows: rows.map(
      (row) =>
        [
          paths.positions.get(row.filePath) ?? 0,
          authors.positions.get(row.authorEmail) ?? 0,
          row.cohortMonth,
          row.count,
        ] as const,
    ),
  };
};

const stringOf = (value: unknown): string =>
  typeof value === "string" ? value : "";

const separator = "\u{1F}";

/**
 * Turns one survival output into facts, classifying every file under the current
 * rules. Outputs from before paths were kept hold per-extension objects instead
 * (`legacyValueKey` names their count): `index` still reads them, without a
 * purpose, until `scan` has replaced them.
 */
export const normalizePathRows = ({
  raw,
  metric,
  legacyValueKey,
  context,
  sourceFilesOnly,
}: {
  readonly raw: unknown;
  readonly metric: string;
  readonly legacyValueKey: string;
  readonly context: NormalizeContext;
  /**
   * Leaves out files the rules no longer call source: a line count only ever
   * covers source files, even when `scan` has not caught up with a rule edit.
   */
  readonly sourceFilesOnly: boolean;
}): Fact[] => {
  const paths = arrayAt(raw, "paths");
  const authors = arrayAt(raw, "authors");
  const counts = new Map<string, number>();
  const legacyFacts: Fact[] = [];

  for (const row of arrayAt(raw, "rows")) {
    if (!Array.isArray(row)) {
      legacyFacts.push({
        metric,
        value: numberAt(row, legacyValueKey),
        categories: {
          extension: stringAt(row, "extension"),
          author: stringAt(row, "authorEmail"),
          cohort: stringAt(row, "cohortMonth"),
        },
      });
      continue;
    }
    const cells: readonly unknown[] = row;
    const filePath = stringOf(paths[Number(cells[0])]);
    const purpose = context.classifyFile(filePath);
    if (sourceFilesOnly && !purpose.source) {
      continue;
    }
    const key = [
      extensionOf(filePath),
      stringOf(authors[Number(cells[1])]),
      stringOf(cells[2]),
      purpose.label,
    ].join(separator);
    counts.set(key, (counts.get(key) ?? 0) + Number(cells[3]));
  }

  return [
    ...legacyFacts,
    ...counts.entries().map(([key, value]): Fact => {
      const [extension = "", author = "", cohort = "", purpose = ""] =
        key.split(separator);
      return {
        metric,
        value,
        categories: { extension, author, cohort, purpose },
      };
    }),
  ];
};

import { Effect } from "effect";

import { numberAt, recordAt } from "../../../shared/json.ts";
import { scanTreeWithBlobCache } from "./shared/tree-scan.ts";
import type { Collector, Fact } from "./shared/types.ts";

type RuleCounts = Record<string, number>;

type DirectiveCounts = { count: number; byRule: RuleCounts };

/**
 * Block-level `<linter>-disable` … `<linter>-enable` regions. Rule hits inside
 * a block are unknowable without running the linter, so blocks are counted as
 * "gray areas" (one hit per rule per block), separately from line-level
 * directives. `coveredLines` sums lines strictly between matched pairs;
 * unmatched disables run to end of file and are only counted. A disable pairs
 * only with its own linter's enable, so `eslint-disable` … `oxlint-enable`
 * stays unbounded.
 */
type BlockCounts = {
  count: number;
  closedCount: number;
  unboundedCount: number;
  coveredLines: number;
  byRule: RuleCounts;
};

/**
 * The linters whose suppression comments are counted, by comment prefix.
 * oxlint honours `eslint-*` comments too, so the prefix records how a comment
 * is spelled, not which tool reads it.
 */
const linters = ["eslint", "oxlint"] as const;

type Linter = (typeof linters)[number];

export type DirectivesOutput = {
  readonly eslintNextLine: DirectiveCounts;
  readonly eslintLine: DirectiveCounts;
  readonly eslintBlocks: BlockCounts;
  readonly oxlintNextLine: DirectiveCounts;
  readonly oxlintLine: DirectiveCounts;
  readonly oxlintBlocks: BlockCounts;
  readonly tsDirectives: {
    ignore: number;
    expectError: number;
    nocheck: number;
  };
};

/**
 * Where each linter's counts sit in {@link DirectivesOutput}. Flat rather than
 * nested by linter, so outputs collected before oxlint was counted (eslint
 * keys only) still normalize.
 */
const outputKeys = {
  eslint: {
    nextLine: "eslintNextLine",
    line: "eslintLine",
    blocks: "eslintBlocks",
  },
  oxlint: {
    nextLine: "oxlintNextLine",
    line: "oxlintLine",
    blocks: "oxlintBlocks",
  },
} as const satisfies Record<Linter, unknown>;

const emptyBlockCounts = (): BlockCounts => ({
  count: 0,
  closedCount: 0,
  unboundedCount: 0,
  coveredLines: 0,
  byRule: {},
});

const emptyOutput = (): DirectivesOutput => ({
  eslintNextLine: { count: 0, byRule: {} },
  eslintLine: { count: 0, byRule: {} },
  eslintBlocks: emptyBlockCounts(),
  oxlintNextLine: { count: 0, byRule: {} },
  oxlintLine: { count: 0, byRule: {} },
  oxlintBlocks: emptyBlockCounts(),
  tsDirectives: { ignore: 0, expectError: 0, nocheck: 0 },
});

/** Extracts the rule names after a directive, stopping at a comment terminator or `--`. */
const parseRules = (afterDirective: string): string[] => {
  let rest = afterDirective;
  for (const terminator of ["*/", "-->", "--"]) {
    const terminatorIndex = rest.indexOf(terminator);
    if (terminatorIndex !== -1) {
      rest = rest.slice(0, terminatorIndex);
    }
  }
  return rest
    .split(",")
    .map((rule) => rule.trim())
    .filter((rule) => /^[@\w/-]+$/.test(rule) && rule.length > 0);
};

const addRules = (byRule: RuleCounts, rules: readonly string[]) => {
  for (const rule of rules.length > 0 ? rules : ["(all)"]) {
    byRule[rule] = (byRule[rule] ?? 0) + 1;
  }
};

const quickPattern =
  /(?:eslint|oxlint)-(?:disable|enable)|@ts-(?:ignore|expect-error|nocheck)/;

/**
 * A lint directive and its kind. The first match on a line wins, so a comment
 * that mentions the other linter's directive in its rationale is still
 * attributed to the linter it opens with.
 */
const lintDirectivePattern =
  /(eslint|oxlint)-(disable-next-line|disable-line|disable|enable)/;

/** Scans one file's content; results are cached per blob by the tree scanner. */
export const scanFileForDirectives = (content: string): DirectivesOutput => {
  const output = emptyOutput();
  if (!quickPattern.test(content)) {
    return output;
  }

  // Each linter pairs only its own disable and enable comments.
  const openBlockLines = new Map<Linter, number>();

  for (const [index, line] of content.split("\n").entries()) {
    if (!quickPattern.test(line)) {
      continue;
    }
    const lintDirective = lintDirectivePattern.exec(line);
    if (line.includes("@ts-ignore")) {
      output.tsDirectives.ignore += 1;
    } else if (line.includes("@ts-expect-error")) {
      output.tsDirectives.expectError += 1;
    } else if (line.includes("@ts-nocheck")) {
      output.tsDirectives.nocheck += 1;
    } else if (lintDirective !== null) {
      const [directive, prefix, kind] = lintDirective;
      const linter: Linter = prefix === "oxlint" ? "oxlint" : "eslint";
      const keys = outputKeys[linter];
      const rules = parseRules(
        line.slice(lintDirective.index + directive.length),
      );
      switch (kind) {
        case "disable-next-line": {
          output[keys.nextLine].count += 1;
          addRules(output[keys.nextLine].byRule, rules);
          break;
        }
        case "disable-line": {
          output[keys.line].count += 1;
          addRules(output[keys.line].byRule, rules);
          break;
        }
        case "disable": {
          output[keys.blocks].count += 1;
          addRules(output[keys.blocks].byRule, rules);
          openBlockLines.set(linter, index);
          break;
        }
        case "enable": {
          const openBlockLine = openBlockLines.get(linter);
          if (openBlockLine !== undefined) {
            output[keys.blocks].closedCount += 1;
            output[keys.blocks].coveredLines += Math.max(
              0,
              index - openBlockLine - 1,
            );
            openBlockLines.delete(linter);
          }
          break;
        }
      }
    }
  }

  for (const linter of linters) {
    const blocks = output[outputKeys[linter].blocks];
    blocks.unboundedCount = blocks.count - blocks.closedCount;
  }

  return output;
};

const mergeRuleCounts = (target: RuleCounts, source: unknown) => {
  for (const [rule, count] of Object.entries(
    recordAt({ wrapped: source }, "wrapped"),
  )) {
    if (typeof count === "number") {
      target[rule] = (target[rule] ?? 0) + count;
    }
  }
};

/** Sums per-file results (as re-read from the blob cache, hence `unknown`). */
export const mergeDirectives = (
  fileResults: readonly unknown[],
): DirectivesOutput => {
  const merged = emptyOutput();
  for (const result of fileResults) {
    for (const linter of linters) {
      const keys = outputKeys[linter];
      for (const key of [keys.nextLine, keys.line]) {
        const counts = recordAt(result, key);
        merged[key].count += numberAt(counts, "count");
        mergeRuleCounts(merged[key].byRule, counts["byRule"]);
      }

      const blocks = recordAt(result, keys.blocks);
      const mergedBlocks = merged[keys.blocks];
      mergedBlocks.count += numberAt(blocks, "count");
      mergedBlocks.closedCount += numberAt(blocks, "closedCount");
      mergedBlocks.unboundedCount += numberAt(blocks, "unboundedCount");
      mergedBlocks.coveredLines += numberAt(blocks, "coveredLines");
      mergeRuleCounts(mergedBlocks.byRule, blocks["byRule"]);
    }

    const ts = recordAt(result, "tsDirectives");
    merged.tsDirectives.ignore += numberAt(ts, "ignore");
    merged.tsDirectives.expectError += numberAt(ts, "expectError");
    merged.tsDirectives.nocheck += numberAt(ts, "nocheck");
  }
  return merged;
};

export const directivesCollector: Collector = {
  name: "directives",
  description:
    "ESLint and oxlint suppression comments (by linter and rule; block disables as gray areas) and @ts-ignore/@ts-expect-error/@ts-nocheck counts",
  version: "2",
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, catalogPath, sha, cacheKey }) =>
    scanTreeWithBlobCache({
      repoRoot,
      catalogPath,
      sha,
      collectorName: "directives",
      cacheKey,
      scanContent: scanFileForDirectives,
    }).pipe(
      Effect.map((files) => mergeDirectives(files.map((file) => file.result))),
    ),
  normalize: (raw) => {
    const facts: Fact[] = [];
    for (const linter of linters) {
      const keys = outputKeys[linter];
      const kinds = [
        [keys.nextLine, "next-line"],
        [keys.line, "line"],
        [keys.blocks, "block"],
      ] as const;
      for (const [key, type] of kinds) {
        for (const [rule, count] of Object.entries(
          recordAt(recordAt(raw, key), "byRule"),
        )) {
          if (typeof count === "number") {
            facts.push({
              metric: "directives.lint",
              value: count,
              categories: { linter, type, rule },
            });
          }
        }
      }
      facts.push({
        metric: "directives.lintBlockCoveredLines",
        value: numberAt(recordAt(raw, keys.blocks), "coveredLines"),
        categories: { linter },
      });
    }
    const ts = recordAt(raw, "tsDirectives");
    for (const type of ["ignore", "expectError", "nocheck"] as const) {
      facts.push({
        metric: "directives.ts",
        value: numberAt(ts, type),
        categories: { type },
      });
    }
    return facts;
  },
};

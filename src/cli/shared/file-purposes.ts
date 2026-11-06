import { createHash } from "node:crypto";

import picomatch from "picomatch";

import type { BuiltInFilePurpose, FilePurposeRule } from "../../config.ts";
import {
  builtInPurposeOf,
  builtInRulesVersion,
} from "./file-purposes/built-in-rules.ts";

/** A purpose as charts and collectors see it. */
export type ResolvedFilePurpose = {
  /** What the band is called; also the `purpose` category in the cube. */
  readonly label: string;
  /** Whether the lines of these files count towards "Lines of code". */
  readonly source: boolean;
};

/** Reserved names a custom purpose cannot take: two bands would share one label. */
export const builtInFilePurposeDetails: Readonly<
  Record<BuiltInFilePurpose, ResolvedFilePurpose>
> = {
  production: { label: "Production", source: true },
  tests: { label: "Tests", source: true },
  docs: { label: "Docs", source: true },
  examples: { label: "Examples", source: true },
  tooling: { label: "Tooling", source: true },
  "ai-instructions": { label: "AI instructions", source: true },
  "test-data": { label: "Test data", source: false },
  assets: { label: "Assets", source: false },
  "generated-and-vendored": { label: "Generated & vendored", source: false },
  other: { label: "Other", source: false },
};

const { other: otherPurpose } = builtInFilePurposeDetails;

const resolvePurpose = (
  purpose: FilePurposeRule["purpose"],
): ResolvedFilePurpose =>
  typeof purpose === "string"
    ? builtInFilePurposeDetails[purpose]
    : { label: purpose.name, source: purpose.source };

export type FilePurposes = {
  /** Which bin a repo path belongs to. */
  readonly classify: (filePath: string) => ResolvedFilePurpose;
  /**
   * Every purpose in stack order: source purposes first, so hiding the rest of
   * the files chart leaves the very files "Lines of code" counts, and Other last.
   */
  readonly all: readonly ResolvedFilePurpose[];
  /** Changes whenever the rules might change which files are source. */
  readonly rulesKey: string;
};

export const createFilePurposes = ({
  skipBuiltInRules,
  rules,
}: {
  readonly skipBuiltInRules: boolean;
  readonly rules: readonly FilePurposeRule[];
}): FilePurposes => {
  const compiledRules = rules.map((rule) => ({
    matches: picomatch([...rule.paths], { dot: true }),
    purpose: resolvePurpose(rule.purpose),
  }));

  // Paths recur from commit to commit, while a history holds far fewer distinct
  // ones than it has snapshots of them.
  const memo = new Map<string, ResolvedFilePurpose>();
  const classify = (filePath: string): ResolvedFilePurpose => {
    const known = memo.get(filePath);
    if (known !== undefined) {
      return known;
    }
    const purpose =
      compiledRules.find((rule) => rule.matches(filePath))?.purpose ??
      (skipBuiltInRules
        ? otherPurpose
        : builtInFilePurposeDetails[builtInPurposeOf(filePath)]);
    memo.set(filePath, purpose);
    return purpose;
  };

  const customPurposes = new Map(
    compiledRules
      .filter(
        (rule) =>
          !Object.values(builtInFilePurposeDetails).includes(rule.purpose),
      )
      .map((rule) => [rule.purpose.label, rule.purpose]),
  );
  const orderedPurposes = [
    ...Object.values(builtInFilePurposeDetails).filter(
      (purpose) => purpose !== otherPurpose,
    ),
    ...customPurposes.values(),
  ];

  return {
    classify,
    all: [
      ...orderedPurposes.filter((purpose) => purpose.source),
      ...orderedPurposes.filter((purpose) => !purpose.source),
      otherPurpose,
    ],
    rulesKey: createHash("sha256")
      .update(
        JSON.stringify({
          builtInRules: skipBuiltInRules ? undefined : builtInRulesVersion,
          rules: compiledRules.map((rule, index) => [
            rules[index]?.paths,
            rule.purpose.source,
          ]),
        }),
      )
      .digest("hex")
      .slice(0, 12),
  };
};

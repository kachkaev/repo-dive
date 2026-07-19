import { churnCollector } from "./churn.ts";
import { commitMetaCollector } from "./commit-meta.ts";
import { fileTypesCollector } from "./file-types.ts";
import type { Collector } from "./types.ts";

export const builtInCollectors: readonly Collector[] = [
  commitMetaCollector,
  churnCollector,
  fileTypesCollector,
];

export const resolveCollectors = (
  names: string | undefined,
): Collector[] | Error => {
  if (names === undefined) {
    return [...builtInCollectors];
  }

  const requested = names
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  const resolved: Collector[] = [];
  for (const name of requested) {
    const collector = builtInCollectors.find(
      (candidate) => candidate.name === name,
    );
    if (!collector) {
      return new Error(
        `Unknown collector: ${name}. Available: ${builtInCollectors
          .map((candidate) => candidate.name)
          .join(", ")}`,
      );
    }
    resolved.push(collector);
  }

  return resolved;
};

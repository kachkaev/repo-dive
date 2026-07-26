import { createHash } from "node:crypto";

import { Data, Result } from "effect";

import { churnCollector } from "./collectors/churn.ts";
import { commitMetaCollector } from "./collectors/commit-meta.ts";
import { dependenciesCollector } from "./collectors/dependencies.ts";
import { directivesCollector } from "./collectors/directives.ts";
import { fileTypesCollector } from "./collectors/file-types.ts";
import { languagesCollector } from "./collectors/languages.ts";
import type { Collector } from "./collectors/shared/types.ts";
import { survivalCollector } from "./collectors/survival.ts";
import { todoCommentsCollector } from "./collectors/todo-comments.ts";
import type { ResolvedConfig } from "./config.ts";

export {
  type Collector,
  describesTreeState,
  type Fact,
} from "./collectors/shared/types.ts";

export const builtInCollectors: readonly Collector[] = [
  commitMetaCollector,
  churnCollector,
  fileTypesCollector,
  directivesCollector,
  dependenciesCollector,
  todoCommentsCollector,
  languagesCollector,
  survivalCollector,
];

export class UnknownCollectorError extends Data.TaggedError(
  "UnknownCollectorError",
)<{
  readonly name: string;
}> {
  override get message(): string {
    return `Unknown collector: ${this.name}. Available: ${builtInCollectors
      .map((candidate) => candidate.name)
      .join(", ")}`;
  }
}

export const resolveCollectors = (
  names: string | undefined,
): Result.Result<Collector[], UnknownCollectorError> => {
  if (names === undefined) {
    return Result.succeed([...builtInCollectors]);
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
      return Result.fail(new UnknownCollectorError({ name }));
    }
    resolved.push(collector);
  }

  return Result.succeed(resolved);
};

/** Length of the hex fingerprint. 12 hex chars = 48 bits — collision-safe for
 * the handful of (version, config) states a repo ever cycles through. */
const fingerprintLength = 12;

/**
 * Recursively sorts object keys so that structurally equal values serialize
 * identically regardless of key order. Arrays keep their order (it may be
 * meaningful); `undefined` is dropped, matching `JSON.stringify`.
 */
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .toSorted(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

/**
 * A collector's cache fingerprint: a short hash of its version and the config
 * slice it depends on. Written into the catalog sidecar and used as the
 * blob-cache namespace, it is the single key that decides whether a previously
 * collected output is still valid. Config-free collectors fold in `null`, so
 * their fingerprint changes only when {@link Collector.version} is bumped.
 */
export const collectorCacheKey = (
  collector: Collector,
  config: ResolvedConfig,
): string => {
  // A config-free collector yields `undefined` here, which canonicalization
  // drops — so its fingerprint depends on the version alone.
  const input = JSON.stringify(
    canonicalize({
      version: collector.version,
      config: collector.cacheConfig?.(config),
    }),
  );
  return createHash("sha256")
    .update(input)
    .digest("hex")
    .slice(0, fingerprintLength);
};

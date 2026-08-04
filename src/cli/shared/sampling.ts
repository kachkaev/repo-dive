import { Data, Result } from "effect";

import type { CommitMeta } from "./scan.ts";

export type SamplingPolicy =
  "all" | "weekly" | "monthly" | "quarterly" | { readonly everyNth: number };

export class InvalidSamplingPolicyError extends Data.TaggedError(
  "InvalidSamplingPolicyError",
)<{
  readonly input: string;
}> {
  override get message(): string {
    return (
      `Unknown sampling policy: ${this.input}. ` +
      "Expected all, weekly, monthly, quarterly or every-nth:<n>."
    );
  }
}

export const parseSamplingPolicy = (
  input: string,
): Result.Result<SamplingPolicy, InvalidSamplingPolicyError> => {
  if (
    input === "all" ||
    input === "weekly" ||
    input === "monthly" ||
    input === "quarterly"
  ) {
    return Result.succeed(input);
  }

  const everyNthMatch = /^every-nth:(\d+)$/.exec(input);
  if (everyNthMatch?.[1]) {
    const everyNth = Number(everyNthMatch[1]);
    if (everyNth >= 1) {
      return Result.succeed({ everyNth });
    }
  }

  return Result.fail(new InvalidSamplingPolicyError({ input }));
};

/** How a policy is spelled in CLI output (`collectors`, `scan`, `status`). */
export const samplingLabel = (policy: SamplingPolicy): string =>
  typeof policy === "object" ? `every-nth:${policy.everyNth}` : policy;

const isoWeekOf = (date: Date): string => {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayOfWeek = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayOfWeek);
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const bucketOf = (
  policy: "weekly" | "monthly" | "quarterly",
  committerDate: string,
): string => {
  const date = new Date(committerDate);
  if (policy === "weekly") {
    return isoWeekOf(date);
  }
  const month = date.getUTCMonth();
  return policy === "monthly"
    ? `${date.getUTCFullYear()}-${String(month + 1).padStart(2, "0")}`
    : `${date.getUTCFullYear()}-Q${Math.floor(month / 3) + 1}`;
};

/**
 * Picks the sampled subset of commits for a policy. `commits` must be ordered
 * newest first (as `git log` emits them); period policies keep the newest
 * commit of each period, so HEAD is always included.
 *
 * Periods are committer-date periods: a policy asks for one snapshot per week
 * or month of the repository's own history, and a rebased commit belongs to
 * the period it landed in, not the one it was written in.
 */
export const sampleCommits = (
  commits: readonly CommitMeta[],
  policy: SamplingPolicy,
): CommitMeta[] => {
  if (policy === "all") {
    return [...commits];
  }

  if (typeof policy === "object") {
    return commits.filter((_, index) => index % policy.everyNth === 0);
  }

  const seenBuckets = new Set<string>();
  const sampled: CommitMeta[] = [];
  for (const commit of commits) {
    const bucket = bucketOf(policy, commit.committerDate);
    if (!seenBuckets.has(bucket)) {
      seenBuckets.add(bucket);
      sampled.push(commit);
    }
  }
  return sampled;
};

import type { ContributorKind, DashboardData } from "../../../data.ts";
import { cachedBy } from "../../shared/cached-by.ts";

/** The commits-per-month series: author kind, with humans split by AI assistance. */
export const commitKindSeries = {
  human: "Human",
  humanAi: "Human · AI-assisted",
  ai: "AI agent",
  bot: "Bot",
} as const;

/** A month's lines added and deleted, plus the AI-assisted share of the added. */
type ChurnTotals = {
  added: number;
  deleted: number;
  /** Lines added by commits carrying an AI co-author trailer. */
  aiAdded: number;
};

const emptyChurn = (): ChurnTotals => ({ added: 0, deleted: 0, aiAdded: 0 });

/**
 * A month's commit counts by kind plus its churn — everything the two monthly
 * charts need, summed from the per-commit rows rather than shipped alongside
 * them. Churn is kept per author kind rather than as one total so the churn
 * chart's kind filter can subset it without a second pass over the commits.
 */
type MonthlyBucket = Record<keyof typeof commitKindSeries, number> & {
  churn: Record<ContributorKind, ChurnTotals>;
};

/**
 * One pass over the per-commit rows feeds both monthly charts, as
 * `[month, bucket]` pairs in month order. dashboard.json carries no monthly
 * rollup of its own: every field of one is a group-by-month sum over rows the
 * calendar already needs in full, and re-deriving here also means a file
 * written before per-commit kinds still renders — everything lands in the
 * human series there, matching the old two-series chart.
 *
 * The React dashboard sums them once for both sections; here each section is
 * its own component, so {@link monthlyRowsOf} caches the sums per commits
 * array instead.
 */
const sumMonthlyRows = (
  commits: DashboardData["commits"],
): Array<[month: string, bucket: MonthlyBucket]> => {
  const monthlyBuckets = new Map<string, MonthlyBucket>();
  for (const commit of commits) {
    const month = commit.date.slice(0, 7);
    const bucket = monthlyBuckets.get(month) ?? {
      human: 0,
      humanAi: 0,
      ai: 0,
      bot: 0,
      churn: { human: emptyChurn(), ai: emptyChurn(), bot: emptyChurn() },
    };
    const kind = commit.kind ?? "human";
    if (kind === "human") {
      bucket[commit.ai ? "humanAi" : "human"] += 1;
    } else {
      bucket[kind] += 1;
    }
    const churn = bucket.churn[kind];
    churn.added += commit.added;
    churn.deleted += commit.deleted;
    if (commit.ai) {
      churn.aiAdded += commit.added;
    }
    monthlyBuckets.set(month, bucket);
  }
  return [...monthlyBuckets].toSorted(([left], [right]) =>
    left.localeCompare(right),
  );
};

export const monthlyRowsOf = cachedBy(sumMonthlyRows);

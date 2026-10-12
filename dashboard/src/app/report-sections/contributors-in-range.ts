import type {
  ContributorKind,
  ContributorRow,
  CrossKindCounts,
  DashboardData,
} from "../../data.ts";
import type { MonthSpan } from "../shared/history-range.ts";

type Tally = {
  commits: number;
  added: number;
  deleted: number;
  assistedBy: CrossKindCounts;
  assisted: CrossKindCounts;
};

const sumCounts = (counts: CrossKindCounts): number =>
  Object.values(counts).reduce((total, count) => total + count, 0);

/** A contributor with every count in place, whichever range they cover. */
export type ListedContributor = ContributorRow & Tally;

/** Ranking weight: authoring and helping both count as taking part. */
const involvementOf = (tally: Tally): number =>
  tally.commits + sumCounts(tally.assisted);

/**
 * The contributors list over one span of the history: each commit authored in
 * it credited to its author, and to each of its cross-kind co-authors as help
 * given — `assistedBy` and `assisted` are the two halves of the same edge,
 * recorded from each end. The list is ranked by involvement within the span,
 * since whoever leads a recent stretch is often nowhere near the top of the
 * whole history, and capped per kind rather than overall: a repo with hundreds
 * of humans would otherwise crowd out the handful of agents and bots the kind
 * filter exists to reveal.
 *
 * Commits are placed by their author-dated month, the clock the commit
 * calendar uses too; `span` is undefined for the whole history. Unlike the
 * calendar, which draws no day past the report's own, this keeps a commit
 * whose author clock ran ahead: it is still somebody's work, and the whole
 * history has to add up to every commit.
 */
export const contributorsInRange = (
  contributors: readonly ContributorRow[],
  commits: DashboardData["commits"],
  span: MonthSpan | undefined,
  perKindCap: number,
): ListedContributor[] => {
  const tallies = new Map<number, Tally>();
  const tallyOf = (index: number): Tally => {
    const existing = tallies.get(index);
    if (existing) {
      return existing;
    }
    const created: Tally = {
      commits: 0,
      added: 0,
      deleted: 0,
      assistedBy: {},
      assisted: {},
    };
    tallies.set(index, created);
    return created;
  };
  const kindAt = (index: number): ContributorKind =>
    contributors[index]?.kind ?? "human";

  for (const commit of commits) {
    // ISO months compare as strings.
    const month = commit.date.slice(0, 7);
    if (
      commit.contributor === undefined ||
      (span !== undefined && (month < span.first || month > span.last))
    ) {
      continue;
    }
    const author = tallyOf(commit.contributor);
    author.commits += 1;
    author.added += commit.added;
    author.deleted += commit.deleted;

    const authorKind = kindAt(commit.contributor);
    const helperKinds = new Set<ContributorKind>();
    for (const helper of commit.helpers ?? []) {
      const tally = tallyOf(helper);
      tally.assisted[authorKind] = (tally.assisted[authorKind] ?? 0) + 1;
      helperKinds.add(kindAt(helper));
    }
    // Counted once per helper *kind*, so one commit credited to two agents is
    // one AI-assisted commit rather than two.
    for (const kind of helperKinds) {
      author.assistedBy[kind] = (author.assistedBy[kind] ?? 0) + 1;
    }
  }

  const keptPerKind: Record<ContributorKind, number> = {
    human: 0,
    bot: 0,
    ai: 0,
  };
  return (
    tallies
      .entries()
      .toArray()
      // Ties keep the list's own order, which is first appearance in the
      // history, so equal counts don't come out shuffled.
      .toSorted(
        ([leftIndex, left], [rightIndex, right]) =>
          involvementOf(right) - involvementOf(left) || leftIndex - rightIndex,
      )
      .flatMap(([index, tally]) => {
        const contributor = contributors[index];
        const kind = kindAt(index);
        if (!contributor || keptPerKind[kind] >= perKindCap) {
          return [];
        }
        keptPerKind[kind] += 1;
        return [{ ...contributor, ...tally }];
      })
  );
};

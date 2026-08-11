/**
 * Sums parallel lineages' snapshot rows into one timeline.
 *
 * Before a migration assembled the repository, the project's state was the sum
 * of its absorbed predecessors' states — so a tree-state series is drawn by
 * carrying each lineage's latest snapshot forward and adding the active ones
 * up at every snapshot instant. A lineage stops contributing the moment the
 * assembly that absorbed it completes (its `endsAtMs`): from then on the
 * absorbing lineage's own trees contain its content, and counting both would
 * double it. At that instant the handoff is seamless by construction — the
 * first post-assembly tree *is* the union of the absorbed tips.
 */

/**
 * What a composable snapshot row is made of: `sha`/`date` strings and
 * otherwise only numeric leaves, nested in plain records. The index signature
 * is what lets the summing walk a row without casts; inferred object-literal
 * row types satisfy it implicitly.
 */
export type ComposableRow = {
  readonly sha: string;
  readonly date: string;
  readonly [key: string]: unknown;
};

/** Adds `source`'s numeric leaves into `target`, recursing through records. */
const addValuesInto = (
  target: Record<string, unknown>,
  source: Readonly<Record<string, unknown>>,
): void => {
  for (const [key, value] of Object.entries(source)) {
    if (key === "sha" || key === "date") {
      continue;
    }
    if (typeof value === "number") {
      const current = target[key];
      target[key] = (typeof current === "number" ? current : 0) + value;
    } else if (value !== null && typeof value === "object") {
      const existing = target[key];
      const nested: Record<string, unknown> =
        existing !== null && typeof existing === "object"
          ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed to a non-null object; only records ever land here, by the leaf rule above
            (existing as Record<string, unknown>)
          : {};
      target[key] = nested;
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed to a non-null object; only records ever land here, by the leaf rule above
      addValuesInto(nested, value as Record<string, unknown>);
    }
  }
};

export type LineageSnapshot<Row extends ComposableRow> = {
  /** The snapshot row — see {@link ComposableRow} for its shape. */
  readonly row: Row;
  /** Which lineage the snapshot belongs to (any stable key). */
  readonly lineage: number;
  /** When that lineage's contribution ends, as epoch ms (`Infinity` = never). */
  readonly lineageEndsAtMs: number;
};

/**
 * One composed row per snapshot, in input order (which must be chronological
 * by `date`): the snapshot's own values plus the latest values of every other
 * lineage still alive at that instant. A single-lineage input — every repo
 * without a founding graft — composes to exactly its own rows.
 */
export const composeLineageSeries = <Row extends ComposableRow>(
  snapshots: ReadonlyArray<LineageSnapshot<Row>>,
): Row[] => {
  const latest = new Map<number, LineageSnapshot<Row>>();
  return snapshots.map((snapshot) => {
    latest.set(snapshot.lineage, snapshot);
    const timeMs = Date.parse(snapshot.row.date);
    const composed: Record<string, unknown> = {
      sha: snapshot.row.sha,
      date: snapshot.row.date,
    };
    for (const [lineage, candidate] of latest) {
      // The driving snapshot always contributes: its own lineage cannot have
      // ended before one of its snapshots (an absorbed history's last commit
      // predates the assembly that absorbed it).
      if (candidate !== snapshot && timeMs >= candidate.lineageEndsAtMs) {
        latest.delete(lineage);
        continue;
      }
      addValuesInto(composed, candidate.row);
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- summing rows of shape Row yields the same shape; validating that structurally would re-implement the type
    return composed as Row;
  });
};

import type { DashboardData } from "../../data.ts";
import { cachedBy } from "../shared/cached-by.ts";
import { Section, type SectionHeading } from "../shared/primitives.ts";
import { TimeSeriesChart } from "../time-stack-chart.ts";
import { decimate } from "./shared/decimate.ts";
import type { ReportSection } from "./shared/report-section.ts";

/** "a", "a and b", "a, b and c" — the subtitles' own style, no Oxford comma. */
const joinTerms = (terms: readonly string[]): string =>
  terms.length < 2
    ? (terms[0] ?? "")
    : `${terms.slice(0, -1).join(", ")} and ${terms.at(-1)}`;

/**
 * The "Loose ends" series, in reading order: how each is summed out of a
 * directives row, how the subtitle names it, and whether it can exist at all in
 * a tree outside the JS/TS ecosystem.
 *
 * A Python or Go repo has no lint disables and no `@ts-*` directives to have,
 * so lines for them would not read as "nothing suppressed here" but as a
 * finding about something the repo could never have carried — the same reason
 * the dependency charts wait for a lockfile rather than drawing a flat zero.
 * They therefore earn their line only once some commit has actually held one.
 * TODO-style comments are scanned in every source file whatever the language,
 * so that line always draws: none found says something true about the repo
 * rather than about its stack.
 */
const looseEndsSeries: Array<{
  key: string;
  /** How the subtitle names the series, spelled out for the reader. */
  term: string;
  /** A clause the subtitle only needs while this series is drawn. */
  note?: string;
  color: string;
  valueOf: (row: DashboardData["directives"][number]) => number;
  ecosystemSpecific: boolean;
}> = [
  {
    key: "eslint disables",
    term: "eslint disables",
    note: "block disables count as one each",
    color: "var(--series-6)",
    valueOf: (row) => row.eslintNextLine + row.eslintLine + row.eslintBlocks,
    ecosystemSpecific: true,
  },
  {
    key: "oxlint disables",
    term: "oxlint disables",
    note: "block disables count as one each",
    // Not green: it would sit next to eslint's red, a pair red-green color
    // blindness merges
    color: "var(--series-5)",
    valueOf: (row) =>
      (row.oxlintNextLine ?? 0) +
      (row.oxlintLine ?? 0) +
      (row.oxlintBlocks ?? 0),
    ecosystemSpecific: true,
  },
  {
    key: "ts directives",
    term: "TypeScript directives",
    color: "var(--series-3)",
    valueOf: (row) => row.tsIgnore + row.tsExpectError + row.tsNocheck,
    ecosystemSpecific: true,
  },
  {
    key: "todo comments",
    term: "TODO-style comments",
    color: "var(--series-1)",
    valueOf: (row) => row.todos,
    ecosystemSpecific: false,
  },
];

/**
 * The series this repo draws. Tested against every row rather than decimated
 * ones: a single commit somewhere in the history is enough to make the series
 * real, and decimation could well be what drops it.
 */
const drawnLooseEndsOf = cachedBy((data: DashboardData) =>
  looseEndsSeries.filter(
    (series) =>
      !series.ecosystemSpecific ||
      data.directives.some((row) => series.valueOf(row) > 0),
  ),
);

/**
 * The drawn series over time, in the shape `TimeSeriesChart` takes, once per
 * data.
 */
const looseEndsChartOf = cachedBy((data: DashboardData) => {
  const drawnLooseEnds = drawnLooseEndsOf(data);
  return {
    points: decimate(data.directives, 400).map((row) => ({
      dateMs: new Date(row.date).getTime(),
      values: Object.fromEntries(
        drawnLooseEnds.map((series) => [series.key, series.valueOf(row)]),
      ),
    })),
    seriesKeys: drawnLooseEnds.map((series) => series.key),
    colors: drawnLooseEnds.map((series) => series.color),
  };
});

const looseEndsHeadingOf = (data: DashboardData): SectionHeading => {
  const drawnLooseEnds = drawnLooseEndsOf(data);
  return {
    title: "Loose ends",
    subtitle: [
      `${joinTerms(drawnLooseEnds.map((series) => series.term))} in the tree at each commit`,
      // Both linters' series carry the same note on block disables
      ...new Set(drawnLooseEnds.flatMap((series) => series.note ?? [])),
    ].join("; "),
    annotation: data.config?.charts?.annotations?.["loose-ends"],
  };
};

export const looseEndsSectionOf = (
  data: DashboardData,
): ReportSection | undefined => {
  if (data.directives.length === 0) {
    return undefined;
  }
  const heading = looseEndsHeadingOf(data);
  return {
    id: "loose-ends",
    skeleton: heading,
    view: (h, key) =>
      Section(h, {
        ...heading,
        children: [
          // A child of the component that draws this stateless section, so
          // it takes the section's key to stay apart from any other chart
          // that component draws.
          TimeSeriesChart(h, {
            key,
            props: {
              mode: "line",
              legendToggles: true,
              ...looseEndsChartOf(data),
            },
          }),
        ],
      }).key(key),
  };
};

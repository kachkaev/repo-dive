import { Mount, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { AxisBottom, AxisLeft, GridRows } from "./diverging-bars/axes.ts";
import {
  type DivergingLayout,
  divergingLayoutOf,
  type DivergingPoint,
  height,
  margin,
  nearestIndexOf,
} from "./diverging-bars/diverging-layout.ts";
import { barPath } from "./shared/bar-path.ts";
import { CrosshairLine } from "./shared/crosshair-line.ts";
import { formatCount, formatMonth } from "./shared/format.ts";
import { MeasureWidth } from "./shared/measure-width.ts";
import { Legend, Swatch } from "./shared/primitives.ts";
import { TrackPointer } from "./shared/track-pointer.ts";

export type { DivergingPoint } from "./diverging-bars/diverging-layout.ts";

const DivergingPointSchema = Schema.Struct({
  month: Schema.String,
  positive: Schema.Number,
  negative: Schema.Number,
  positiveSecondary: Schema.optional(Schema.Number),
});

/**
 * The marks (grid, bars, baseline and axes) depend on the layout alone, so
 * each is built inside `h.lazy` and a pointer move, which only moves the
 * crosshair and the card, reuses them untouched; the React component splits
 * `DivergingMarks` out for React Compiler to the same end. They are separate
 * lazy calls rather than one because a lazy call builds one node and the
 * React marks are a fragment: this keeps the `<svg>` the same tree.
 */
const DivergingGrid = <M>(h: Html.H<M>, _: "grid", layout: DivergingLayout) =>
  GridRows(h, { ticksY: layout.gridY, width: layout.innerWidth });

const DivergingBar = <M>(
  h: Html.H<M>,
  point: DivergingPoint,
  index: number,
  layout: DivergingLayout,
  /** `url(#…)` of the hatch pattern, when the secondary band is drawn. */
  hatchFill: string | undefined,
) => {
  const { dates, xScale, yScale, barWidth } = layout;
  const zero = yScale(0);
  const x = xScale(dates[index] ?? 0) - barWidth / 2;
  const positiveTop = yScale(point.positive);
  const secondary = point.positiveSecondary ?? 0;
  const secondaryTop = yScale(secondary);
  return h.g.key(point.month).children(
    h.path.attrs({
      d: barPath({
        x,
        y: positiveTop,
        width: barWidth,
        height: Math.max(0, zero - positiveTop),
        roundTop: true,
        roundBottom: true,
      }),
      fill: "var(--diverge-pos)",
    }),
    hatchFill !== undefined &&
      secondary > 0 &&
      // The assisted share of "added", anchored to the baseline. Its top is
      // a seam inside the bar unless it fills the whole bar.
      h.path.attrs({
        d: barPath({
          x,
          y: secondaryTop,
          width: barWidth,
          height: Math.max(0, zero - secondaryTop),
          roundTop: secondary >= point.positive,
          roundBottom: true,
        }),
        fill: hatchFill,
      }),
    h.path.attrs({
      d: barPath({
        x,
        y: zero,
        width: barWidth,
        height: Math.max(0, yScale(-point.negative) - zero),
        roundTop: true,
        roundBottom: true,
      }),
      fill: "var(--diverge-neg)",
    }),
  );
};

/**
 * Drawn over the bars like the other charts' x axis, in the same recessive
 * stroke.
 */
const DivergingBaseline = <M>(
  h: Html.H<M>,
  _: "baseline",
  layout: DivergingLayout,
) => {
  const zero = layout.yScale(0);
  return h.line.attrs({
    x1: "0",
    x2: String(layout.innerWidth),
    y1: String(zero),
    y2: String(zero),
    stroke: "var(--grid-line)",
    "stroke-width": "1",
  });
};

const DivergingAxisLeft = <M>(
  h: Html.H<M>,
  _: "axis-left",
  layout: DivergingLayout,
) => AxisLeft(h, { ticks: layout.yTicks, range: layout.yRange });

const DivergingAxisBottom = <M>(
  h: Html.H<M>,
  _: "axis-bottom",
  layout: DivergingLayout,
) =>
  AxisBottom(h, {
    top: layout.innerHeight,
    ticks: layout.xTicks,
    range: layout.xRange,
    // The axis line spans the scale's range, which `xInset` shrinks; pad it
    // back out so the line runs the full plot width.
    rangePadding: layout.xInset,
  });

type CardRow = {
  label: string;
  color: string;
  hatch?: string | undefined;
  value: string;
};

/**
 * The value card beside the crosshair, laid out like the stacked charts' card:
 * one swatch row per series.
 */
const HoverCard = <M>(
  h: Html.H<M>,
  options: {
    readonly point: DivergingPoint;
    readonly dateMs: number;
    readonly layout: DivergingLayout;
    readonly width: number;
    readonly rows: readonly CardRow[];
  },
) => {
  // Left of the dashed line so it never covers the hovered bar; only when the
  // line is too close to the chart's start to fit the card's estimated width
  // does it flip to the right side. The estimate only picks the side — the
  // left placement anchors the card's right edge (via `right`), so the gap to
  // the line stays 10px whatever the card's true width.
  const cardWidth = 180;
  const crosshairX = margin.left + options.layout.xScale(options.dateMs);
  const fitsLeftOfLine = crosshairX >= 10 + cardWidth;
  return h.div
    .class(
      "pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm will-change-transform",
    )
    .style(
      fitsLeftOfLine
        ? { right: `${options.width - crosshairX + 10}px` }
        : {
            left: `${Math.min(crosshairX + 10, Math.max(0, options.width - cardWidth))}px`,
          },
    )
    .children(
      h.div
        .class("mb-1 font-medium tabular-nums text-(--text-secondary)")
        .children(formatMonth(options.point.month)),
      options.rows.map((row) =>
        h.div
          .key(row.label)
          .class("flex items-center gap-1.5")
          .children(
            Swatch(h, {
              color: row.color,
              hatch: row.hatch,
              className: "inline-block size-2 rounded-xs",
            }),
            h.span.class("text-(--text-secondary)").children(row.label),
            h.span
              .class("ml-auto pl-3 font-medium tabular-nums")
              .children(row.value),
          ),
      ),
    );
};

/** A card value with its direction sign; a zero stays unsigned. */
const signedCount = (sign: "+" | "−", value: number): string =>
  value === 0 ? "0" : `${sign}${formatCount(value)}`;

export const DivergingBarsMessage = UiSchema.TaggedEnum({
  ChangedWidth: { width: Schema.Number },
  MovedPointer: { x: Schema.Number },
  LeftPlot: {},
});

/** Monthly added lines above the baseline, deleted lines below it. */
export const DivergingBars = Html.component({
  name: "DivergingBars",
  props: Schema.Struct({
    points: Schema.Array(DivergingPointSchema),
    positiveLabel: Schema.String,
    negativeLabel: Schema.String,
    /** Legend/tooltip label for the hatched `positiveSecondary` band. */
    positiveSecondaryLabel: Schema.optional(Schema.String),
    /** Hatch color for the `positiveSecondary` band (e.g. the AI kind color). */
    positiveSecondaryHatch: Schema.optional(Schema.String),
  }),
  model: Schema.Struct({
    width: Schema.Number,
    hoverIndex: Schema.UndefinedOr(Schema.Number),
  }),
  message: DivergingBarsMessage,
  // The hovered bar and the measured width are what only the DOM knew.
  restore: false,
}).make({
  init: () => ({ width: 0, hoverIndex: undefined }),
  update: {
    ChangedWidth: ($, { width }) => $.evolve({ width }),
    MovedPointer: ($, { x }) => {
      const hoverIndex = nearestIndexOf(
        divergingLayoutOf($.props.points, $.model.width),
        x,
      );
      return hoverIndex === $.model.hoverIndex
        ? $.model
        : $.evolve({ hoverIndex });
    },
    LeftPlot: ($) =>
      $.model.hoverIndex === undefined
        ? $.model
        : $.evolve({ hoverIndex: undefined }),
  },
  view: (h, model) => {
    const {
      points,
      positiveLabel,
      negativeLabel,
      positiveSecondaryLabel,
      positiveSecondaryHatch,
    } = h.props;
    const hatchId = h.id("hatch");

    if (points.length === 0) {
      return h.p
        .class("text-sm text-(--text-muted)")
        .children("No data collected yet.");
    }

    const showSecondary =
      positiveSecondaryLabel !== undefined &&
      positiveSecondaryHatch !== undefined &&
      points.some((point) => (point.positiveSecondary ?? 0) > 0);

    const { width } = model;
    const layout = divergingLayoutOf(points, width);
    const hatchFill = showSecondary ? `url(#${hatchId})` : undefined;

    const legendItems = [
      { label: positiveLabel, color: "var(--diverge-pos)" },
      ...(showSecondary
        ? [
            {
              label: positiveSecondaryLabel,
              color: "var(--diverge-pos)",
              hatch: positiveSecondaryHatch,
            },
          ]
        : []),
      { label: negativeLabel, color: "var(--diverge-neg)" },
    ];

    const hovered =
      model.hoverIndex === undefined ? undefined : points[model.hoverIndex];
    const hoveredMs =
      model.hoverIndex === undefined
        ? undefined
        : layout.dates[model.hoverIndex];
    // The card lists every legend row in legend order, zeros included — like
    // the stacked cards with up to three series — so it keeps its shape while
    // the cursor scrubs across months with and without an assisted share.
    const hoverRows: CardRow[] =
      hovered === undefined
        ? []
        : [
            {
              label: positiveLabel,
              color: "var(--diverge-pos)",
              value: signedCount("+", hovered.positive),
            },
            ...(showSecondary
              ? [
                  {
                    label: positiveSecondaryLabel,
                    color: "var(--diverge-pos)",
                    hatch: positiveSecondaryHatch,
                    value: signedCount("+", hovered.positiveSecondary ?? 0),
                  },
                ]
              : []),
            {
              label: negativeLabel,
              color: "var(--diverge-neg)",
              value: signedCount("−", hovered.negative),
            },
          ];

    return h.div.children(
      h.div
        .class("relative")
        .onMount(
          MeasureWidth().pipe(
            Mount.map((measured) =>
              DivergingBarsMessage.ChangedWidth({ width: measured }),
            ),
          ),
        )
        .children(
          // Drawn at width 0 too, as the React chart is before its first
          // measurement, so the card keeps its height from the start.
          h.svg
            .attrs({
              width: String(width),
              height: String(height),
              role: "img",
            })
            .children(
              showSecondary &&
                h.defs.children(
                  // Assist hatch: 2px lines at a 6px pitch — 2/3 base fill, 1/3 helper.
                  h.pattern
                    .attrs({
                      id: hatchId,
                      width: "6",
                      height: "6",
                      patternUnits: "userSpaceOnUse",
                      patternTransform: "rotate(45)",
                    })
                    .children(
                      h.rect.attrs({
                        width: "2",
                        height: "6",
                        fill: positiveSecondaryHatch,
                      }),
                    ),
                ),
              h.g
                .class("visx-group")
                .attr("transform", `translate(${margin.left}, ${margin.top})`)
                .children(
                  h.lazy(DivergingGrid, "grid", layout),
                  layout.points.map((point, index) =>
                    h.lazy(DivergingBar, point, index, layout, hatchFill),
                  ),
                  h.lazy(DivergingBaseline, "baseline", layout),
                  h.lazy(DivergingAxisLeft, "axis-left", layout),
                  h.lazy(DivergingAxisBottom, "axis-bottom", layout),
                  h.rect
                    .attrs({
                      width: String(layout.innerWidth),
                      height: String(layout.innerHeight),
                      fill: "transparent",
                    })
                    .onMount(
                      TrackPointer().pipe(
                        Mount.map((position) =>
                          position === undefined
                            ? DivergingBarsMessage.LeftPlot()
                            : DivergingBarsMessage.MovedPointer({
                                x: position.x,
                              }),
                        ),
                      ),
                    ),
                ),
            ),
          // Over the chart, under the card — both outside the <svg>, see CrosshairLine.
          hoveredMs !== undefined &&
            CrosshairLine(h, {
              xScale: layout.xScale,
              valueMs: hoveredMs,
              left: margin.left,
              top: margin.top,
              height: layout.innerHeight,
            }),
          hovered !== undefined &&
            hoveredMs !== undefined &&
            HoverCard(h, {
              point: hovered,
              dateMs: hoveredMs,
              layout,
              width,
              rows: hoverRows,
            }),
        ),
      Legend(h, { items: legendItems }),
    );
  },
});

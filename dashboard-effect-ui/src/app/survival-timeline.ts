import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

import { formatDate } from "./shared/format.ts";
import { DataTable, Section } from "./shared/primitives.ts";
import {
  PercentControl,
  SegmentedControl,
} from "./shared/segmented-control.ts";
import type { SurvivalColorScales } from "./shared/survival-colors.ts";
import {
  effectiveSelectionOf,
  FlatRowSchema,
  SplitDimensionSchema,
  SurvivalTimelineRowSchema,
  SurvivalUnitSchema,
  type SurvivalVariant,
  survivalVariantsOf,
} from "./survival-timeline/survival-variants.ts";
import { TimeSeriesChart } from "./time-stack-chart.ts";

/**
 * The page-wide color scales: functions, so they have no Schema of their own
 * and are declared; props compare them by reference.
 */
const SurvivalColorScalesSchema = Schema.declare<SurvivalColorScales>(
  (input): input is SurvivalColorScales =>
    typeof input === "object" && input !== null,
  { title: "SurvivalColorScales" },
);

const SurvivalTimelineProps = Schema.Struct({
  title: Schema.String,
  subtitle: Schema.String,
  annotation: Schema.optional(Schema.String),
  /** Lowercase plural of the counted unit — "lines" or "files"; labels the controls. */
  unit: SurvivalUnitSchema,
  /**
   * Dense per-commit values by language, for the flat (unshaded) variants.
   * Build it once per dashboard.json: the timeline's derivations are cached
   * by it.
   */
  flatRows: Schema.Array(FlatRowSchema),
  survivalRows: Schema.Array(SurvivalTimelineRowSchema),
  /** File purposes in stack order: a fixed vocabulary, unlike the other splits. */
  purposeOrder: Schema.Array(Schema.String),
  maxContributorsInCharts: Schema.Number,
  /**
   * The page-wide color scales (see `survivalColorScalesOf`), so a language
   * or contributor keeps one color across every chart and variant.
   */
  colorScales: SurvivalColorScalesSchema,
});
type SurvivalTimelineProps = typeof SurvivalTimelineProps.Type;

export const SurvivalTimelineMessage = UiSchema.TaggedEnum({
  ToggledSplit: { dimension: SplitDimensionSchema },
  ToggledAgeShading: { shadeByYear: Schema.Boolean },
  ToggledPercent: { percent: Schema.Boolean },
});

const variantsOf = (props: SurvivalTimelineProps) =>
  survivalVariantsOf(
    props.flatRows,
    props.survivalRows,
    props.purposeOrder,
    props.maxContributorsInCharts,
    props.colorScales,
    props.unit,
  );

/**
 * The "View data" table of one variant, built through `h.lazy` so the
 * timeline's re-renders (a percent toggle) reuse its rows untouched.
 */
const SurvivalTable = <M>(
  h: Html.H<M>,
  { chart, tableColumns }: SurvivalVariant,
) =>
  DataTable(h, {
    caption: "View data",
    header: ["date", ...tableColumns.map((column) => column.label)],
    rows: chart.points.map((point) => [
      formatDate(new Date(point.dateMs).toISOString()),
      ...tableColumns.map((column) =>
        column.keys.reduce((sum, key) => sum + (point.values[key] ?? 0), 0),
      ),
    ]),
  });

/**
 * A unified living-code timeline at one grain — lines of code or file counts —
 * switched by three segmented controls (split dimension, age shading,
 * absolute/percentage), the port of the React `SurvivalTimeline`
 * (`survival-timeline.tsx`). Controls sit above the frame; the legend, chart
 * and data table adapt to the selection.
 *
 * Every variant is drawn from one of two sources: dense per-commit flat rows
 * (`flatRows` — language values at every collected commit) or sampled survival
 * cross-tabs (`survivalRows` — creator/cohort attribution at sampled commits),
 * and a catalog can carry one without the other. Tracking the two sources
 * separately lets the toggles, the effective selection and the fallbacks all
 * follow what is actually there.
 *
 * The Model holds the three controls' values, as the React component's
 * `useState` calls do. Everything else comes from `survivalVariantsOf`,
 * cached by the prop arrays, so switching back to a variant hands the chart
 * the arrays it drew before.
 *
 * Deviations from the React component: no `useDeferredValue`, so the chart
 * and the table re-shape in the render that presses the control (see the
 * README's "Synchronous re-renders"); each variant is shaped once and kept,
 * where React shapes it on every switch.
 */
export const SurvivalTimeline = Html.component({
  name: "SurvivalTimeline",
  props: SurvivalTimelineProps,
  model: Schema.Struct({
    /** The split the viewer picked, even while the data cannot draw it. */
    preferredDimension: SplitDimensionSchema,
    /** Whether the viewer wants age shading, even where it is unavailable. */
    shadeByYear: Schema.Boolean,
    percentMode: Schema.Boolean,
  }),
  message: SurvivalTimelineMessage,
}).make({
  init: ($) => ({
    preferredDimension: "language" as const,
    shadeByYear: variantsOf($.props).shadedYearCount >= 2,
    percentMode: false,
  }),
  update: {
    ToggledSplit: ($, { dimension }) =>
      $.evolve({ preferredDimension: dimension }),
    ToggledAgeShading: ($, { shadeByYear }) => $.evolve({ shadeByYear }),
    ToggledPercent: ($, { percent }) => $.evolve({ percentMode: percent }),
  },
  view: (h, model) => {
    const { props } = h;
    const { unit, title } = props;
    const variants = variantsOf(props);
    const { flatAvailable, shadedAvailable, canDraw } = variants;
    const { dimension, shaded } = effectiveSelectionOf(
      variants,
      model.preferredDimension,
      model.shadeByYear,
    );
    const variant = variants.variantOf(dimension, shaded);
    const { chart } = variant;
    const supportsPercent = chart.seriesKeys.length > 1;

    return Section(h, {
      title,
      subtitle: props.subtitle,
      annotation: props.annotation,
      controls: [
        SegmentedControl(h, {
          key: "split",
          label: `Split ${unit}`,
          value: dimension,
          onChange: (next) =>
            SurvivalTimelineMessage.ToggledSplit({ dimension: next }),
          options: [
            {
              value: "language",
              label: "by language",
              disabled: !canDraw("language"),
              title: canDraw("language")
                ? undefined
                : "No per-language data collected yet",
            },
            {
              value: "purpose",
              label: "by purpose",
              disabled: !canDraw("purpose"),
              title: canDraw("purpose")
                ? undefined
                : "No per-purpose data collected yet",
            },
            {
              value: "contributor",
              label: "by contributor",
              disabled: !canDraw("contributor"),
              title: canDraw("contributor")
                ? undefined
                : "No survival samples collected yet",
            },
            {
              value: "all",
              label: `all ${unit}`,
              disabled: !canDraw("all"),
              title: canDraw("all") ? undefined : `No ${unit} collected yet`,
            },
          ],
        }),
        SegmentedControl(h, {
          key: "age-shading",
          label: "Age shading",
          value: shaded ? "shade" : "none",
          onChange: (next) =>
            SurvivalTimelineMessage.ToggledAgeShading({
              shadeByYear: next === "shade",
            }),
          options: [
            {
              value: "shade",
              label:
                unit === "lines"
                  ? "shade by year written"
                  : "shade by year created",
              disabled: !shadedAvailable[dimension],
              title: shadedAvailable[dimension]
                ? undefined
                : "No per-year survival data collected yet",
            },
            {
              value: "none",
              label: "no shading",
              disabled: !flatAvailable[dimension],
              title: flatAvailable[dimension]
                ? undefined
                : "This split only exists in the survival samples, which are always dated",
            },
          ],
        }),
        PercentControl(h, {
          key: "percent",
          label: `${title} value display`,
          value: model.percentMode,
          onChange: (percent) =>
            SurvivalTimelineMessage.ToggledPercent({ percent }),
          disabled: !supportsPercent,
          disabledTitle: "A single series is always 100%",
        }),
      ],
      footer: [h.lazy(SurvivalTable, variant)],
      children: [
        TimeSeriesChart(h, {
          props: {
            mode: "area",
            percentMode: model.percentMode,
            domainStartMs: variants.domainStartMs,
            domainEndMs: variants.domainEndMs,
            domainPeak: variants.domainPeak,
            // The split variants name their groups in the primary legend, so
            // a second row names the year shades; the all-units variant's
            // only legend already is the years.
            secondaryLegendItems:
              shaded && dimension !== "all"
                ? variants.yearLegendItems
                : undefined,
            // Languages, contributors and purposes can be hidden to read the
            // rest; the all-units legend names year shades (or nothing),
            // where hiding a band would mean nothing.
            legendToggles: dimension !== "all",
            ...chart,
          },
        }),
      ],
    });
  },
});

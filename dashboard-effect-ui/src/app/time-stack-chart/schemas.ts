import { Schema } from "effect";

/** One instant of a time series: a value per series key. */
export const TimePointSchema = Schema.Struct({
  dateMs: Schema.Number,
  values: Schema.Record(Schema.String, Schema.Number),
});
export type TimePoint = typeof TimePointSchema.Type;

/** A legend entry; `hatch` overlays diagonal lines in that color. */
export const LegendItemSchema = Schema.Struct({
  label: Schema.String,
  color: Schema.String,
  hatch: Schema.optional(Schema.String),
});
export type LegendItem = typeof LegendItemSchema.Type;

/**
 * Collapses several stacked sub-series (e.g. one contributor's per-year bands)
 * into a single legend + tooltip row summing the listed `keys`.
 */
export const SeriesGroupSchema = Schema.Struct({
  label: Schema.String,
  color: Schema.String,
  keys: Schema.Array(Schema.String),
});
export type SeriesGroup = typeof SeriesGroupSchema.Type;

export const ChartModeSchema = Schema.Literals(["area", "bar", "line"]);
export type ChartMode = typeof ChartModeSchema.Type;

/** Mirrors `PointUnit` in `shared/time-axis.ts`. */
export const PointUnitSchema = Schema.Literals(["day", "month"]);

/**
 * A function prop, such as `valueFormat`: it has no Schema of its own, so it
 * is declared, and props compare it by reference.
 */
export const ValueFormatSchema = Schema.declare<(value: number) => string>(
  (input): input is (value: number) => string => typeof input === "function",
  { title: "ValueFormat" },
);

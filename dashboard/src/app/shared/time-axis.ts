import { monthShortNames } from "./format.ts";

/**
 * What a data point stands for on the time axis, and so how finely the axis
 * may tick and how the tooltip names the instant under the cursor: a day gets
 * its date and weekday, a month gets its name — a monthly bucket is pinned to
 * a synthetic mid-month timestamp, and "2025-06-15 · Sunday" would read as a
 * claim about one particular Sunday.
 */
export type PointUnit = "day" | "month";

/** The day of the month every monthly bucket is pinned to (UTC). */
const monthBucketDay = 15;

/**
 * Where a monthly bucket (`YYYY-MM`) sits on a time axis: mid-month, so its bar
 * centres on its own month, and the tick naming that month lines up with it.
 */
export const monthBucketMs = (isoMonth: string): number => {
  const [year, month] = isoMonth.split("-", 2).map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, monthBucketDay);
};

export type TimeTick = { valueMs: number; label: string };

const dayMs = 86_400_000;

/**
 * A calendar step the axis can tick at: every `step` days (7 = Sundays, the
 * week start d3's default ticks used) or every `step` months (12 and above =
 * whole years, aligned so that a 5-year step lands on years divisible by 5).
 */
type TickInterval = { unit: "day" | "month"; step: number };

const monthIntervals: TickInterval[] = [1, 2, 3, 6, 12, 24, 60, 120, 240].map(
  (step) => ({ unit: "month", step }),
);

/**
 * The steps an axis may tick at, finest first — never finer than one point, so
 * a few months of monthly bars are not labelled with weekly dates, and a
 * per-commit series (dated by day in its tooltip) is not labelled with hours.
 */
const intervalsOf: Record<PointUnit, TickInterval[]> = {
  day: [
    { unit: "day", step: 1 },
    { unit: "day", step: 2 },
    { unit: "day", step: 7 },
    ...monthIntervals,
  ],
  month: monthIntervals,
};

/** Day `day` of the month `month` months after January of year 0 (UTC). */
const msOfMonth = (month: number, day: number): number =>
  Date.UTC(Math.floor(month / 12), month % 12, day);

const tickValuesOf = (
  startMs: number,
  endMs: number,
  interval: TickInterval,
  pointUnit: PointUnit,
): number[] => {
  const valuesMs: number[] = [];
  if (interval.unit === "day") {
    // Days since the epoch, which fell on a Thursday — shifted by 4, a weekly
    // step lands on Sundays.
    const offset = interval.step === 7 ? 4 : 0;
    for (let day = Math.ceil(startMs / dayMs); day * dayMs <= endMs; day++) {
      if ((day + offset) % interval.step === 0) {
        valuesMs.push(day * dayMs);
      }
    }
    return valuesMs;
  }
  // Monthly buckets tick where their bars are centred; a continuous series
  // ticks at the month's boundary, like any calendar.
  const day = pointUnit === "month" ? monthBucketDay : 1;
  const start = new Date(startMs);
  const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
  for (
    let month = startMonth - (startMonth % interval.step);
    msOfMonth(month, day) <= endMs;
    month += interval.step
  ) {
    if (msOfMonth(month, day) >= startMs) {
      valuesMs.push(msOfMonth(month, day));
    }
  }
  return valuesMs;
};

/** Names each tick at its step's grain, adding the year wherever it changes. */
const labelTicks = (valuesMs: number[], interval: TickInterval): TimeTick[] =>
  valuesMs.map((valueMs, index) => {
    const date = new Date(valueMs);
    const year = date.getUTCFullYear();
    if (interval.unit === "month" && interval.step >= 12) {
      return { valueMs, label: String(year) };
    }
    const previousValueMs = valuesMs[index - 1];
    const showYear =
      previousValueMs === undefined ||
      new Date(previousValueMs).getUTCFullYear() !== year;
    const month = monthShortNames[date.getUTCMonth()] ?? "";
    if (interval.unit === "month") {
      return { valueMs, label: showYear ? `${month} ${year}` : month };
    }
    const monthDay = `${month} ${date.getUTCDate()}`;
    return { valueMs, label: showYear ? `${monthDay}, ${year}` : monthDay };
  });

/**
 * Ticks for a time axis spanning `startMs`–`endMs` whose points stand for
 * `pointUnit`s: the finest calendar step that fits the width (a label per
 * 90px, 2 to 8 of them), never finer than a point — so four months of monthly
 * bars read "Jul 2026 · Aug · Sep · Oct", where d3's default ticks for so short
 * a span would be weekly dates. Computed in UTC, like the monthly buckets and
 * the tooltips' dates.
 */
export const timeAxisTicks = ({
  startMs,
  endMs,
  pointUnit,
  widthPx,
}: {
  startMs: number;
  endMs: number;
  pointUnit: PointUnit;
  widthPx: number;
}): TimeTick[] => {
  const maxTicks = Math.max(2, Math.min(8, Math.floor(widthPx / 90)));
  const intervals = intervalsOf[pointUnit];
  // Only the chosen step is labelled: the finest ones can run to thousands of
  // ticks (daily over a decade-long history).
  let fewest: { valuesMs: number[]; interval: TickInterval } | undefined;
  for (const interval of intervals) {
    const valuesMs = tickValuesOf(startMs, endMs, interval, pointUnit);
    if (valuesMs.length === 0) {
      continue;
    }
    if (valuesMs.length <= maxTicks) {
      return labelTicks(valuesMs, interval);
    }
    if (fewest === undefined || valuesMs.length < fewest.valuesMs.length) {
      fewest = { valuesMs, interval };
    }
  }
  if (fewest !== undefined) {
    // No step fits: the finer ones overflow and the coarser ones miss the span
    // (Monday to Friday has no Sunday). Slightly crowded beats unlabelled.
    return labelTicks(fewest.valuesMs, fewest.interval);
  }
  // A span shorter than the finest step that crosses none of its boundaries
  // (two commits an hour apart): name the point in its middle instead.
  const [finest] = intervals;
  return finest === undefined
    ? []
    : labelTicks([Math.round((startMs + endMs) / 2)], finest);
};

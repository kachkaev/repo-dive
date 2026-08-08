export const formatCount = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(Math.round(value));
};

export const formatBytes = (value: number): string => {
  if (value >= 1_073_741_824) {
    return `${(value / 1_073_741_824).toFixed(1)} GB`;
  }
  if (value >= 1_048_576) {
    return `${(value / 1_048_576).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} kB`;
  }
  return `${value} B`;
};

export const monthShortNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const formatMonth = (isoMonth: string): string => {
  const [year, month] = isoMonth.split("-");
  return `${monthShortNames[Number(month) - 1] ?? month} ${year}`;
};

export const formatDate = (isoDate: string): string => isoDate.slice(0, 10);

/** Indexed the way `Date.prototype.getUTCDay` numbers weekdays. */
const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * The weekday a date falls on, named in full. Read as UTC, so the date part of
 * an ISO string always names its own weekday rather than the adjacent day in
 * the viewer's timezone. Two-letter abbreviations exist only in the calendar's row
 * gutter, where seven of them stand side by side over 10px cells; anywhere a
 * weekday follows a date, it is spelled out.
 */
const formatDayOfWeek = (isoDate: string): string => {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const utcDay = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1),
  ).getUTCDay();
  return dayNames[utcDay] ?? "";
};

/** How a date is stamped wherever there is room for its weekday: `2025-06-09 · Monday`. */
export const formatDateWithDayOfWeek = (isoDate: string): string =>
  `${formatDate(isoDate)} · ${formatDayOfWeek(isoDate)}`;

export const formatPercent = (ratio: number): string =>
  `${(ratio * 100).toFixed(ratio >= 0.1 ? 0 : 1)}%`;

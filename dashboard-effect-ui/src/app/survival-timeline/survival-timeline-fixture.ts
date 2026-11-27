import { dashboardDataOf } from "../shared/dashboard-data-fixture.ts";
import { survivalColorScalesOf } from "../shared/survival-colors.ts";
import type { FlatRow, SurvivalTimelineRow } from "./survival-variants.ts";

/** A survival sample at noon on `date` (`YYYY-MM-DD`). */
const survivalRowOf = (date: string, scale: number): SurvivalTimelineRow => ({
  date: `${date}T12:00:00+00:00`,
  byCohort: { "2025-05": 100 * scale, "2026-02": 50 * scale },
  byContributor: { Alice: 120 * scale, Bob: 30 * scale },
  byContributorYear: {
    Alice: { "2025": 90 * scale, "2026": 30 * scale },
    Bob: { "2025": 10 * scale, "2026": 20 * scale },
  },
  byLanguage: { TypeScript: 130 * scale, CSS: 20 * scale },
  byLanguageYear: {
    TypeScript: { "2025": 90 * scale, "2026": 40 * scale },
    CSS: { "2025": 10 * scale, "2026": 10 * scale },
  },
  byPurpose: { Production: 120 * scale, Tests: 30 * scale },
  byPurposeYear: {
    Production: { "2025": 80 * scale, "2026": 40 * scale },
    Tests: { "2025": 20 * scale, "2026": 10 * scale },
  },
});

/**
 * Props of a lines-grain `SurvivalTimeline` for tests: two per-commit rows by
 * language, and two survival samples whose units were written in 2025 and
 * 2026, so every variant has something to draw and age shading is on by
 * default.
 */
export const survivalTimelinePropsOf = (
  overrides: {
    flatRows?: readonly FlatRow[];
    survivalRows?: readonly SurvivalTimelineRow[];
  } = {},
) => ({
  title: "Lines of code",
  subtitle: "lines over time",
  unit: "lines" as const,
  flatRows: overrides.flatRows ?? [
    {
      date: "2026-01-10T12:00:00+00:00",
      values: { TypeScript: 100, CSS: 10 },
    },
    {
      date: "2026-03-01T12:00:00+00:00",
      values: { TypeScript: 260, CSS: 40 },
    },
  ],
  survivalRows: overrides.survivalRows ?? [
    survivalRowOf("2026-02-01", 1),
    survivalRowOf("2026-03-01", 2),
  ],
  purposeOrder: ["Production", "Tests", "Docs"],
  maxContributorsInCharts: 8,
  colorScales: survivalColorScalesOf(dashboardDataOf()),
});

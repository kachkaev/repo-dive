import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  ReportSections,
  ReportSectionsMessage,
  reportSectionsOf,
} from "./report-sections.ts";
import { dashboardDataOf } from "./shared/dashboard-data-fixture.ts";

const data = dashboardDataOf();

it("lists the sections the data has something for, in reading order", () => {
  expect(reportSectionsOf(data, 8).map((section) => section.id)).toStrictEqual([
    "commit-calendar",
    "commits-per-month",
    "churn-per-month",
    "contributors",
  ]);
  // Built once per data and cap, as the view and the subscriptions both ask.
  expect(reportSectionsOf(data, 8)).toBe(reportSectionsOf(data, 8));
});

it.effect(
  "reveals one section per frame tick, and stops ticking once all are shown",
  () =>
    Effect.gen(function* () {
      const s = yield* Story.make(ReportSections, {
        data,
        maxContributorsInCharts: 8,
      });
      expect(s.model.revealed).toBe(0);
      // Nothing runs in a story, so the Subscription is asserted by key.
      expect(s.subscriptions).toStrictEqual(["frameTicks"]);

      const sectionCount = reportSectionsOf(data, 8).length;
      for (let tick = 1; tick <= sectionCount; tick += 1) {
        s.send(ReportSectionsMessage.TickedFrame());
        expect(s.model.revealed).toBe(tick);
      }
      expect(s.subscriptions).toStrictEqual([]);
    }),
);

import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { dashboardDataOf } from "../shared/dashboard-data-fixture.ts";
import {
  ContributorsSection,
  ContributorsSectionMessage,
} from "./contributors-section.ts";

it.effect("keeps its kind filter and range in its Model", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(ContributorsSection, {
      data: dashboardDataOf(),
      maxContributorsInCharts: 10,
    });
    expect(s.model).toStrictEqual({ range: "all-years", kindFilter: "all" });

    s.send(ContributorsSectionMessage.ToggledKindFilter({ kindFilter: "ai" }));
    s.send(ContributorsSectionMessage.PickedRange({ range: "year-2025" }));
    expect(s.model).toStrictEqual({ range: "year-2025", kindFilter: "ai" });
  }),
);

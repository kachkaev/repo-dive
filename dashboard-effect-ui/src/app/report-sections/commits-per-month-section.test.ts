import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { dashboardDataOf } from "../shared/dashboard-data-fixture.ts";
import {
  CommitsPerMonthSection,
  CommitsPerMonthSectionMessage,
} from "./commits-per-month-section.ts";

it.effect("keeps its kind filter and percent mode in its Model", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(CommitsPerMonthSection, {
      data: dashboardDataOf(),
    });
    expect(s.model).toStrictEqual({ kindFilter: "all", percent: false });

    s.send(CommitsPerMonthSectionMessage.ToggledPercent({ percent: true }));
    s.send(
      CommitsPerMonthSectionMessage.ToggledKindFilter({ kindFilter: "bot" }),
    );
    expect(s.model).toStrictEqual({ kindFilter: "bot", percent: true });
  }),
);

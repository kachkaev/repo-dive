import { Story } from "@effect/ui/testing";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { cn } from "../cn.ts";
import { Tooltip, TooltipEvents, TooltipMessage } from "./tooltip.ts";

const props = { delay: 400, pressed: true, triggerClass: cn() };

it.effect("opens and closes as ui-kit's tooltip asks", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(Tooltip, props);
    expect(s.model.open).toBe(false);
    s.send(TooltipMessage.RequestedOpenTooltip());
    expect(s.model.open).toBe(true);
    s.send(TooltipMessage.RequestedCloseTooltip());
    expect(s.model.open).toBe(false);
  }),
);

it.effect("reports a click on its trigger, and whether Alt was held", () =>
  Effect.gen(function* () {
    const s = yield* Story.make(Tooltip, props);
    s.send(TooltipMessage.ClickedTrigger({ alt: false }));
    s.emitted(TooltipEvents.Clicked({ alt: false }));
    s.send(TooltipMessage.ClickedTrigger({ alt: true }));
    s.emitted(TooltipEvents.Clicked({ alt: true }));
  }),
);

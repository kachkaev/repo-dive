import type { Html } from "@effect/ui/html";

/**
 * The few Lucide icons the dashboard draws (lucide.dev, ISC), as Effect UI
 * view functions. The React dashboard takes them from `lucide-react`; here the
 * icon nodes are copied over, with the attributes `lucide-react` 1.x renders,
 * so the markup and the `[&_svg]` selectors in the controls' classes match.
 * Each takes the class the React call site passes as `className`.
 */
const LucideIcon = <M>(
  h: Html.H<M>,
  names: readonly [name: string, ...aliases: string[]],
  className: string | undefined,
  paths: readonly string[],
) =>
  h.svg
    .attrs({
      xmlns: "http://www.w3.org/2000/svg",
      width: "24",
      height: "24",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    })
    // lucide-react names the icon and each of its aliases in a class.
    .class("lucide", ...names.map((name) => `lucide-${name}`), className)
    .children(paths.map((d) => h.path.attr("d", d)));

export const InfoIcon = <M>(h: Html.H<M>, className?: string) =>
  LucideIcon(h, ["info"], className, []).children(
    h.circle.attrs({ cx: "12", cy: "12", r: "10" }),
    h.path.attr("d", "M12 16v-4"),
    h.path.attr("d", "M12 8h.01"),
  );

export const LoaderCircleIcon = <M>(h: Html.H<M>, className?: string) =>
  LucideIcon(h, ["loader-circle", "loader-2"], className, [
    "M21 12a9 9 0 1 1-6.219-8.56",
  ]);

export const ChevronDownIcon = <M>(h: Html.H<M>, className?: string) =>
  LucideIcon(h, ["chevron-down"], className, ["m6 9 6 6 6-6"]);

export const ChevronUpIcon = <M>(h: Html.H<M>, className?: string) =>
  LucideIcon(h, ["chevron-up"], className, ["m18 15-6-6-6 6"]);

export const CheckIcon = <M>(h: Html.H<M>, className?: string) =>
  LucideIcon(h, ["check"], className, ["M20 6 9 17l-5-5"]);

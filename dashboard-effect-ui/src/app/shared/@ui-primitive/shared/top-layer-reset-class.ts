import { cn } from "../../cn.ts";

/**
 * Classes for every box `@effect/ui-kit` puts in the top layer: a popup's
 * positioner and backdrop. Base UI portals its popups to `<body>`; ui-kit
 * leaves them where the view writes them and shows them as manual popovers, so
 * two things need undoing.
 *
 * - The browser's popover box: its border, padding, background and
 *   `overflow: auto` (ui-kit itself writes `position`, `inset` and `margin`).
 * - Everything a popup would inherit from where it is written rather than
 *   from `<body>`: a tooltip on a `tabular-nums` date, inside a `font-medium
 *   uppercase` label or a `pointer-events-none` overlay, would otherwise take
 *   on all of it. Each inherited property the dashboard sets anywhere goes
 *   back to the body's value. Colors, font sizes and line heights are left
 *   to the popup, which sets its own: a `leading-*` here would also set the
 *   inherited `--tw-leading` variable, which then overrides the line height
 *   of the popup's own `text-xs`.
 */
export const topLayerResetClass = cn(
  "pointer-events-auto visible cursor-auto overflow-visible border-0 bg-transparent p-0 text-left font-normal tracking-normal whitespace-normal normal-case not-italic normal-nums",
);

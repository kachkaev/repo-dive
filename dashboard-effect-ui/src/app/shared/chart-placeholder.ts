import type { Html } from "@effect/ui/html";

/**
 * TEMPORARY: stands in a section's chart card for a chart the Effect UI port
 * does not draw yet, at roughly the chart's height so the page keeps its
 * shape. Each chart port replaces its section's one call to this with the
 * real chart; the file goes once the last placeholder has (see the README).
 */
export const ChartPlaceholder = <M>(
  h: Html.H<M>,
  options: {
    /** The React file the chart is ported from, e.g. `time-stack-chart.tsx`. */
    readonly reactFile: string;
    /** What the chart draws, in a few words. */
    readonly description: string;
    /** Height in px: about what the React chart and its legend take up, so the page keeps its shape. */
    readonly height: number;
  },
) =>
  h.div
    .attr("data-placeholder", options.reactFile)
    .class(
      "flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-(--text-muted) bg-(--surface-2) px-4 text-center text-xs text-(--text-muted)",
    )
    .style({ height: `${options.height}px` })
    .children(
      h.span
        .class("font-medium tracking-wide uppercase")
        .children("Not ported to Effect UI yet"),
      h.span(
        `${options.description} — `,
        h.code
          .class("font-mono")
          .children(`dashboard/src/app/${options.reactFile}`),
      ),
    );

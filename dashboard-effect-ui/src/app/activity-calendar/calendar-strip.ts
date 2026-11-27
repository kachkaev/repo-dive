import type { Html } from "@effect/ui/html";

import { kindColors } from "../shared/contributor-kinds.ts";
import { monthShortNames } from "../shared/format.ts";
import {
  binSize,
  type CalendarKindFilter,
  cellSize,
  dayLabels,
  type DayTotal,
  filterValueOf,
  levelOpacities,
  marginLeft,
  marginTop,
  roundPartPx,
  stackPartsOf,
  type StripLayout,
  type WeekStart,
} from "./calendar-layout.ts";

/**
 * One cell: a miniature stacked bar. Kind segments (full color) stack
 * bottom-up in fixed order, the AI-assisted human slice carries the hatch
 * pattern, and the whole stack's opacity encodes the day's volume — the same
 * building block as the monthly bars, normalized to cell height.
 */
const CellStack = <M>(
  h: Html.H<M>,
  options: {
    readonly isoDate: string;
    readonly day: DayTotal;
    readonly x: number;
    readonly y: number;
    readonly level: number;
    readonly filter: CalendarKindFilter;
    readonly hatchId: string;
    readonly clipId: string;
  },
) => {
  const { x, y, level } = options;
  if (level === 0) {
    return h.rect.key(options.isoDate).attrs({
      x: String(x),
      y: String(y),
      width: String(cellSize),
      height: String(cellSize),
      rx: "2",
      fill: "var(--surface-2)",
    });
  }
  const parts = stackPartsOf(options.day, options.filter);
  const heights = roundPartPx(
    parts.map((part) => part.value),
    cellSize,
  );
  const segments: Array<{
    part: (typeof parts)[number];
    partHeight: number;
    topY: number;
  }> = [];
  let nextTopY = y + cellSize;
  for (const [index, part] of parts.entries()) {
    const partHeight = heights[index] ?? 0;
    if (partHeight <= 0) {
      continue;
    }
    nextTopY -= partHeight;
    segments.push({ part, partHeight, topY: nextTopY });
  }
  return h.g
    .key(options.isoDate)
    .attrs({
      opacity: String(levelOpacities[level]),
      "clip-path": `url(#${options.clipId})`,
    })
    .children(
      segments.map(({ part, partHeight, topY }) =>
        h.g.key(`${part.kind}-${String(part.hatched)}`).children(
          h.rect.attrs({
            x: String(x),
            y: String(topY),
            width: String(cellSize),
            height: String(partHeight),
            fill: kindColors[part.kind],
          }),
          part.hatched &&
            h.rect.attrs({
              x: String(x),
              y: String(topY),
              width: String(cellSize),
              height: String(partHeight),
              fill: `url(#${options.hatchId})`,
            }),
        ),
      ),
    );
};

/**
 * One strip of months under its title. Everything in it depends on its
 * arguments only, so the calendar builds it inside `h.lazy` and a hover,
 * which only moves the tooltip, reuses the strip untouched.
 *
 * Each hover target carries an id made of `dayIdPrefix` and its date: the
 * React calendar anchors the tooltip to the hovered element itself, and
 * ui-kit's Tooltip anchors to an element by id.
 */
export const CalendarStrip = <M>(
  h: Html.H<M>,
  layout: StripLayout,
  title: string,
  weekStartsOn: WeekStart,
  levelOf: (value: number) => number,
  filter: CalendarKindFilter,
  /** Unique per strip: the hatch pattern's and the clip path's ids start with it. */
  patternIdBase: string,
  dayIdPrefix: string,
  onHover: (isoDate: string) => M,
  onHoverEnd: M,
) => {
  const hatchId = `${patternIdBase}-hatch`;
  const clipId = `${patternIdBase}-clip`;
  const width = marginLeft + layout.columnCount * binSize + 2;
  const height = marginTop + 7 * binSize;
  return h.div.key(title).children(
    h.div.class("text-xs font-medium text-(--text-secondary)").children(title),
    h.svg
      .attrs({
        width: String(width),
        height: String(height),
        role: "img",
        "aria-label": `Commit calendar, ${title}`,
      })
      .on("mouseleave", onHoverEnd)
      .children(
        h.defs.children(
          // AI-assist hatch: 1px lines at a 3px pitch — 2/3 author fill, 1/3 helper.
          h.pattern
            .attrs({
              id: hatchId,
              width: "3",
              height: "3",
              patternUnits: "userSpaceOnUse",
              patternTransform: "rotate(45)",
            })
            .children(
              h.rect.attrs({ width: "1", height: "3", fill: kindColors.ai }),
            ),
          // Rounds each cell's stacked segments as one shape (scales to any cell).
          h.clipPath
            .attrs({ id: clipId, clipPathUnits: "objectBoundingBox" })
            .children(
              h.rect.attrs({ width: "1", height: "1", rx: "0.2", ry: "0.2" }),
            ),
        ),
        layout.monthLabels.map((label) =>
          h.svgText
            .key(label.isoMonth)
            .attrs({
              x: String(marginLeft + label.column * binSize),
              y: String(marginTop - 5),
              "font-size": "9",
              fill: "var(--text-muted)",
            })
            .children(
              monthShortNames[Number(label.isoMonth.slice(5)) - 1] ?? "",
            ),
        ),
        dayLabels[weekStartsOn].map((label, row) =>
          h.svgText
            .key(label)
            .attrs({
              x: "0",
              y: String(marginTop + row * binSize + binSize / 2 + 3),
              "font-size": "9",
              fill: "var(--text-muted)",
            })
            .children(label),
        ),
        layout.cells.map((cell) =>
          cell.day === undefined
            ? // An empty day's own fill, drawn as an outline: subtle enough to
              // stay background, with the ring the only thing that says "no
              // data". Half a pixel of inset keeps the stroke on the grid.
              h.rect.key(cell.isoDate).attrs({
                x: String(marginLeft + cell.column * binSize + 0.5),
                y: String(marginTop + cell.row * binSize + 0.5),
                width: String(cellSize - 1),
                height: String(cellSize - 1),
                rx: "1.5",
                fill: "none",
                stroke: "var(--surface-2)",
              })
            : CellStack(h, {
                isoDate: cell.isoDate,
                day: cell.day,
                x: marginLeft + cell.column * binSize,
                y: marginTop + cell.row * binSize,
                level: levelOf(filterValueOf(cell.day, filter)),
                filter,
                hatchId,
                clipId,
              }),
        ),
        // Hover targets on top, so segment boundaries never break hovering.
        layout.cells.map((cell) =>
          h.rect
            .key(`hover-${cell.isoDate}`)
            .attrs({
              id: `${dayIdPrefix}${cell.isoDate}`,
              x: String(marginLeft + cell.column * binSize),
              y: String(marginTop + cell.row * binSize),
              width: String(cellSize),
              height: String(cellSize),
              fill: "transparent",
            })
            .on("mouseenter", () => onHover(cell.isoDate)),
        ),
      ),
  );
};

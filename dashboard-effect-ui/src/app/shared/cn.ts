import { Html } from "@effect/ui/html";

/**
 * Joins class strings with one space, dropping `false`, `null`, `undefined`
 * and `""` — Effect UI's `classNames`, as `.class(…)` joins its arguments.
 *
 * It exists so better-tailwindcss sees a class string held anywhere but in a
 * `.class(…)` call: a `…Class` constant or option, a lookup table's values,
 * a helper's return. Unlike the React dashboard's `cn` it does not run
 * tailwind-merge: every class is written out as the merged string the React
 * DOM renders, the linter's no-conflicting-classes catches a conflict inside
 * one string, and joining keeps the bundle free of tailwind-merge.
 *
 * @example `cn("rounded-xs", options.swatchClass)`
 */
export const cn = Html.classNames;

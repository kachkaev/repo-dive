import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  languageOfExtension,
  sourceExtensions,
} from "../../../../src/cli/shared/languages.ts";
import {
  contributorColors,
  customPurposeColors,
  languageColors,
  unknownTypeColors,
} from "./category-colors.ts";

test("every language the CLI can report has a fixed color", () => {
  const languages = new Set([...sourceExtensions].map(languageOfExtension));
  const uncolored = [...languages].filter(
    (language) => !Object.hasOwn(languageColors, language),
  );
  expect(uncolored).toStrictEqual([]);
});

/*
 * Pairwise separation of the colors one chart draws together, so a legend
 * swatch can always be matched to its band. Distances are OKLab ΔE×100; the
 * color-vision-deficiency check simulates protanopia and deuteranopia with
 * the Machado et al. (2009) matrices at full severity.
 */

type Mode = "light" | "dark";

const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const declarationsIn = (block: string): Record<string, string | undefined> =>
  Object.fromEntries(
    block
      .matchAll(/--([\w-]+):([^;]+);/g)
      .map((match): [string, string | undefined] => [
        match[1] ?? "",
        match[2]?.trim(),
      ]),
  );
const lightDeclarations = declarationsIn(
  css.slice(css.indexOf(":root {"), darkStart),
);
const declarations: Record<Mode, Record<string, string | undefined>> = {
  light: lightDeclarations,
  dark: { ...lightDeclarations, ...declarationsIn(css.slice(darkStart)) },
};

/** Resolves `var(--…)` chains and `light-dark()` pairs down to a hex color. */
function hexOf(value: string, mode: Mode): string {
  let color = value;
  let variable = /^var\(--([\w-]+)\)$/.exec(color)?.[1];
  while (variable !== undefined) {
    const declared = declarations[mode][variable];
    if (declared === undefined) {
      throw new Error(`--${variable} is not declared`);
    }
    color = declared;
    variable = /^var\(--([\w-]+)\)$/.exec(color)?.[1];
  }
  const pair = /^light-dark\((#\w{6}),\s*(#\w{6})\)$/.exec(color);
  if (pair) {
    return (mode === "light" ? pair[1] : pair[2]) ?? color;
  }
  if (!/^#\w{6}$/.test(color)) {
    throw new Error(`Cannot resolve ${color}`);
  }
  return color;
}

type Vector = [number, number, number];

const linearRgbOf = (hex: string): Vector =>
  [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as Vector;

const oklabOf = ([red, green, blue]: Vector): Vector => {
  const long = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const medium = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const short = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );
  return [
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short,
  ];
};

const machado: Record<"protan" | "deutan", [Vector, Vector, Vector]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

const simulate = (rgb: Vector, matrix: [Vector, Vector, Vector]): Vector =>
  matrix.map((row) =>
    Math.min(
      1,
      Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]),
    ),
  ) as Vector;

const distance = (left: Vector, right: Vector) =>
  100 * Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

const deltaE = (left: string, right: string) =>
  distance(oklabOf(linearRgbOf(left)), oklabOf(linearRgbOf(right)));

const colorBlindDeltaE = (left: string, right: string) =>
  Math.min(
    ...Object.values(machado).map((matrix) =>
      distance(
        oklabOf(simulate(linearRgbOf(left), matrix)),
        oklabOf(simulate(linearRgbOf(right), matrix)),
      ),
    ),
  );

/** Every pair of `colors` that falls short, with its distances, for a readable failure. */
function closePairs(
  colors: ReadonlyArray<readonly [string, string]>,
  mode: Mode,
  {
    minDeltaE,
    minColorBlindDeltaE = 0,
    minAdjacentDeltaE = minDeltaE,
  }: {
    minDeltaE: number;
    minColorBlindDeltaE?: number;
    minAdjacentDeltaE?: number;
  },
): string[] {
  const resolved = colors.map(
    ([label, color]) => [label, hexOf(color, mode)] as const,
  );
  const failures: string[] = [];
  for (const [index, [label, hex]] of resolved.entries()) {
    for (const [offset, [otherLabel, otherHex]] of resolved
      .slice(index + 1)
      .entries()) {
      const normal = deltaE(hex, otherHex);
      const colorBlind = colorBlindDeltaE(hex, otherHex);
      const minNormal = offset === 0 ? minAdjacentDeltaE : minDeltaE;
      if (normal < minNormal || colorBlind < minColorBlindDeltaE) {
        failures.push(
          `${label}~${otherLabel}: ΔE ${normal.toFixed(1)}, color-blind ΔE ${colorBlind.toFixed(1)}`,
        );
      }
    }
  }
  return failures;
}

const other = ["Other", "var(--text-muted)"] as const;
const kinds = [
  ["Bots", "var(--kind-bot)"],
  ["AI agents", "var(--kind-ai)"],
] as const;
const contributorEntries = contributorColors.map(
  (color, index) => [`contributor ${index + 1}`, color] as const,
);
const builtInPurposes = [
  ["Production", "var(--purpose-production)"],
  ["Tests", "var(--purpose-tests)"],
  ["Docs", "var(--purpose-docs)"],
  ["Examples", "var(--purpose-examples)"],
  ["Tooling", "var(--purpose-tooling)"],
  ["AI instructions", "var(--kind-ai)"],
  ["Test data", "var(--purpose-test-data)"],
  ["Assets", "var(--purpose-assets)"],
  ["Generated & vendored", "var(--purpose-generated)"],
  other,
] as const;
/** Languages likely to share a chart in almost any repository. */
const commonLanguages = [
  "TypeScript",
  "TSX",
  "JavaScript",
  "JSX",
  "Python",
  "Markdown",
  "YAML",
  "Go",
  "Rust",
  "C",
  "C Header",
  "C++",
  "HTML",
  "CSS",
  "Shell",
].map((language) => [language, languageColors[language] ?? ""] as const);

describe.each<Mode>(["light", "dark"])("%s theme", (mode) => {
  test("the default eight contributors, the kind bands and Other stay apart", () => {
    expect(
      closePairs([...contributorEntries.slice(0, 8), ...kinds, other], mode, {
        minDeltaE: 10,
        minColorBlindDeltaE: 6,
        minAdjacentDeltaE: 15,
      }),
    ).toStrictEqual([]);
  });

  test("every contributor slot stays clear of the others and the kinds", () => {
    expect(
      closePairs([...contributorEntries, ...kinds, other], mode, {
        minDeltaE: 10,
        minAdjacentDeltaE: 10,
      }),
    ).toStrictEqual([]);
  });

  test("the built-in purposes stay apart, neighbors in the stack the most", () => {
    expect(
      closePairs(builtInPurposes, mode, {
        minDeltaE: 10,
        minColorBlindDeltaE: 6,
        minAdjacentDeltaE: 15,
      }),
    ).toStrictEqual([]);
  });

  test("custom purposes stay clear of the built-in ones and the kinds", () => {
    const failures = customPurposeColors.flatMap((color, index) =>
      closePairs(
        [[`custom ${index + 1}`, color], ...builtInPurposes, ...kinds],
        mode,
        { minDeltaE: 10, minAdjacentDeltaE: 10 },
      ).filter((failure) => failure.startsWith(`custom ${index + 1}~`)),
    );
    expect(failures).toStrictEqual([]);
  });

  test("common languages, unknown types and Other stay apart", () => {
    expect(
      closePairs(
        [
          ...commonLanguages,
          ...unknownTypeColors.map(
            (color, index) => [`unknown type ${index + 1}`, color] as const,
          ),
          other,
        ],
        mode,
        { minDeltaE: 10 },
      ),
    ).toStrictEqual([]);
  });

  test("every category color stands out from the chart surface", () => {
    const surface = hexOf("var(--surface-1)", mode);
    const faint = [
      ...contributorEntries,
      ...kinds,
      ...builtInPurposes,
      ...customPurposeColors.map((color) => ["custom purpose", color] as const),
      ...Object.entries(languageColors),
      ...unknownTypeColors.map((color) => ["unknown type", color] as const),
    ]
      .map(
        ([label, color]) =>
          [label, deltaE(hexOf(color, mode), surface)] as const,
      )
      // About 3:1 for the near-greys; the pale linguist colors (TSX,
      // JavaScript) sit just above it.
      .filter(([, distance]) => distance < 23)
      .map(([label, distance]) => `${label}: ΔE ${distance.toFixed(1)}`);
    expect(faint).toStrictEqual([]);
  });
});

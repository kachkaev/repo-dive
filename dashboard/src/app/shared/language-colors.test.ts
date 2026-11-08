import { expect, test } from "vitest";

import {
  languageOfExtension,
  sourceExtensions,
} from "../../../../src/cli/shared/languages.ts";
import { languageColors } from "./language-colors.ts";

test("every language the CLI can report has a fixed color", () => {
  const languages = new Set([...sourceExtensions].map(languageOfExtension));
  const uncolored = [...languages].filter(
    (language) => !Object.hasOwn(languageColors, language),
  );
  expect(uncolored).toStrictEqual([]);
});

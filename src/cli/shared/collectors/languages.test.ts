import { expect, test } from "vitest";

import { parseTokeiJson } from "./languages.ts";

test("parseTokeiJson folds embedded children into the parent language", () => {
  const output = parseTokeiJson(
    JSON.stringify({
      Markdown: {
        blanks: 10,
        code: 0,
        comments: 90,
        reports: [
          {
            name: "./README.md",
            stats: { blanks: 10, code: 0, comments: 90, blobs: {} },
          },
        ],
        children: {
          JavaScript: [
            {
              name: "./README.md",
              stats: { blanks: 1, code: 8, comments: 1, blobs: {} },
            },
          ],
        },
      },
      TypeScript: {
        blanks: 5,
        code: 100,
        comments: 20,
        reports: [
          {
            name: "./a.ts",
            stats: { blanks: 5, code: 100, comments: 20, blobs: {} },
          },
        ],
        children: {},
      },
      Total: { blanks: 0, code: 0, comments: 0, reports: [], children: {} },
    }),
  );

  expect(output.byLanguage["Markdown"]).toStrictEqual({
    files: 1,
    code: 0,
    comments: 90,
    blanks: 10,
    lines: 110,
  });
  expect(output.byLanguage["TypeScript"]?.lines).toBe(125);
  expect(output.totalLines).toBe(235);
  expect(output.totalFiles).toBe(2);
});

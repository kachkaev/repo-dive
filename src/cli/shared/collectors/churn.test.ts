import { expect, test } from "vitest";

import { parseNumstat } from "./churn.ts";

test("parseNumstat aggregates churn by extension", () => {
  const churn = parseNumstat(
    [
      "10\t2\tsrc/a.ts",
      "5\t0\tsrc/b.ts",
      "1\t1\tREADME.md",
      "-\t-\tlogo.png",
      "",
    ].join("\n"),
  );

  expect(churn.filesChanged).toBe(4);
  expect(churn.added).toBe(16);
  expect(churn.deleted).toBe(3);
  expect(churn.binaryFiles).toBe(1);
  expect(churn.byExtension[".ts"]).toStrictEqual({
    files: 2,
    added: 15,
    deleted: 2,
  });
  expect(churn.byExtension[".png"]).toStrictEqual({
    files: 1,
    added: 0,
    deleted: 0,
  });
});

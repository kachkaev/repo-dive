import { expect, test } from "vitest";

import { parseLsTree } from "./file-types.ts";

test("parseLsTree aggregates blob sizes by extension", () => {
  const fileTypes = parseLsTree(
    [
      "100644 blob 1111111111111111111111111111111111111111     120\tsrc/a.ts",
      "100644 blob 2222222222222222222222222222222222222222      30\tREADME.md",
      "120000 blob 3333333333333333333333333333333333333333       -\tlink",
      "160000 commit 4444444444444444444444444444444444444444       -\tsubmodule",
      "",
    ].join("\n"),
  );

  expect(fileTypes.totalFiles).toBe(3);
  expect(fileTypes.totalBytes).toBe(150);
  expect(fileTypes.byExtension[".ts"]).toStrictEqual({ files: 1, bytes: 120 });
  expect(fileTypes.byExtension["(none)"]).toStrictEqual({ files: 1, bytes: 0 });
});

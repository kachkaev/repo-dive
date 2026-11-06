import { expect, test } from "vitest";

import { parseTreeBlobs } from "./git.ts";

test("parseTreeBlobs reads files as they are and skips gitlinks", () => {
  const stdout = [
    "100644 blob aaa      12\tsrc/naïve file.ts",
    "160000 commit bbb       -\tllm/llama.cpp",
    "120000 blob ccc       9\tCLAUDE.md",
    "",
  ].join("\0");

  expect(parseTreeBlobs(stdout)).toStrictEqual([
    { blobSha: "aaa", filePath: "src/naïve file.ts", sizeBytes: 12 },
    { blobSha: "ccc", filePath: "CLAUDE.md", sizeBytes: 9 },
  ]);
});

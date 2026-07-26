import { expect, test } from "vitest";

import { extensionOf } from "./types.ts";

test("extensionOf maps paths to extension categories", () => {
  expect(extensionOf("src/cli/shared/scan.ts")).toBe(".ts");
  expect(extensionOf("README.MD")).toBe(".md");
  expect(extensionOf("Makefile")).toBe("(none)");
  expect(extensionOf(".gitignore")).toBe("(none)");
  expect(extensionOf("a/b.c/d")).toBe("(none)");
});

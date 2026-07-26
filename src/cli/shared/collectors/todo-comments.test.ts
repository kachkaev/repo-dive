import { expect, test } from "vitest";

import { scanFileForTodos } from "./todo-comments.ts";

test("scanFileForTodos counts markers per line", () => {
  const output = scanFileForTodos(
    [
      "// TODO: fix",
      "// FIXME and TODO on one line",
      "code();",
      "// HACK",
    ].join("\n"),
  );
  expect(output.total).toBe(4);
  expect(output.byMarker).toStrictEqual({ TODO: 2, FIXME: 1, HACK: 1 });
});

// A marker is counted anywhere on a line, so it need not open the comment.
// These are the shapes seen in real codebases (labelled TODOs, markers tucked
// after a `--` suppression rationale, JSX and block comments) — all must count.
test("scanFileForTodos matches markers embedded mid-line", () => {
  const output = scanFileForTodos(
    [
      "// TODO (Ada Lovelace) [2024-01-01]: extract a helper",
      "const x = 1; // @ts-expect-error -- TODO (Bob) [2024-02-02]: fix types",
      "// eslint-disable-next-line no-console -- FIXME (Cleo): remove logging",
      "/* HACK (Dan): workaround until upstream ships the patch */",
      "{/* TODO (Eve) [2024-03-03]: replace with real component */}",
      "const label = 'a todo written in prose stays uncounted';",
    ].join("\n"),
  );
  expect(output.total).toBe(5);
  expect(output.byMarker).toStrictEqual({ TODO: 3, FIXME: 1, HACK: 1 });
});

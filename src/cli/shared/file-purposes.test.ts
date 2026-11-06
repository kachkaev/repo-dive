import { expect, test } from "vitest";

import {
  builtInFilePurposeDetails,
  createFilePurposes,
} from "./file-purposes.ts";

const { classify, all } = createFilePurposes({
  skipBuiltInRules: false,
  rules: [],
});

test.each([
  // Production: code no other rule claims.
  ["lib/http.c", "Production"],
  ["src/transformers/testing_utils.py", "Production"],
  ["packages/react-test-renderer/src/index.js", "Production"],
  ["packages/effect/src/testing/TestClock.ts", "Production"],
  ["mlxrunner/sample/sample.go", "Production"],
  ["app/ui/index.html", "Production"],
  // Tests: whatever layout, whatever convention.
  ["packages/foo/__tests__/a-test.js", "Tests"],
  ["tests/foo.py", "Tests"],
  ["test/foo.c", "Tests"],
  ["tests_integration/cli/a.js", "Tests"],
  ["packages/foo/integration-tests/a.js", "Tests"],
  ["server/routes_test.go", "Tests"],
  ["src/a.test.tsx", "Tests"],
  ["src/a.spec.ts", "Tests"],
  ["src/a.e2e.ts", "Tests"],
  ["src/a.bench.ts", "Tests"],
  ["models/test_bert.py", "Tests"],
  ["conftest.py", "Tests"],
  ["packages/effect/typetest/a.tst.ts", "Tests"],
  ["benchmarks/a.js", "Tests"],
  ["compiler/fixtures/a.js", "Tests"],
  // A rule's order decides what a file with two claims is.
  ["scripts/__tests__/a.js", "Tests"],
  ["examples/foo/tests/a.py", "Tests"],
  [".github/workflows/test.yml", "Tooling"],
  // Examples.
  ["examples/run.py", "Examples"],
  ["docs/examples/simple.c", "Examples"],
  ["playground/hmr/index.ts", "Examples"],
  ["src/button.stories.tsx", "Examples"],
  // Docs: documentation folders and any other Markdown.
  ["docs/guide.md", "Docs"],
  ["website/src/page.tsx", "Docs"],
  ["README.md", "Docs"],
  ["packages/foo/CHANGELOG.md", "Docs"],
  [".changeset/a.md", "Docs"],
  // Tooling.
  [".github/ISSUE_TEMPLATE/bug.yml", "Tooling"],
  [".circleci/config.yml", "Tooling"],
  [".husky/install.mjs", "Tooling"],
  ["scripts/release.ts", "Tooling"],
  ["scripts/build/build.js", "Tooling"],
  ["vite.config.ts", "Tooling"],
  ["packages/foo/eslint.config.mjs", "Tooling"],
  [".eslintrc.js", "Tooling"],
  ["docker-compose.dev.yml", "Tooling"],
  ["pnpm-workspace.yaml", "Tooling"],
  ["CMake/FindFoo.cmake", "Tooling"],
  ["flow-typed/react.js", "Tooling"],
  // AI instructions.
  [".claude/skills/fix/SKILL.md", "AI instructions"],
  [".claude/instructions.md", "AI instructions"],
  [".agents/skills/a/run.py", "AI instructions"],
  [".ai/review-rules.md", "AI instructions"],
  [".cursor/rules/a.mdc", "AI instructions"],
  [".cursorrules", "AI instructions"],
  // A folder of agents' settings is no instructions, though.
  [".claude/settings.json", "Other"],
  ["AGENTS.md", "AI instructions"],
  ["compiler/CLAUDE.md", "AI instructions"],
  [".github/copilot-instructions.md", "AI instructions"],
  ["skills/foo/SKILL.md", "AI instructions"],
  // Test data: test files with no source extension.
  ["tests/__snapshots__/a.snap", "Test data"],
  ["tests/data/test1234", "Test data"],
  ["convert/testdata/a.json", "Test data"],
  ["tests/fixtures/logo.png", "Test data"],
  // Assets.
  ["docs/logo.png", "Assets"],
  ["app/font.woff2", "Assets"],
  ["public/icon.svg", "Assets"],
  // Generated & vendored: beats anything the path says.
  ["yarn.lock", "Generated & vendored"],
  ["compiler/Cargo.lock", "Generated & vendored"],
  ["pnpm-lock.yaml", "Generated & vendored"],
  ["go.sum", "Generated & vendored"],
  ["vendor/lib/a.c", "Generated & vendored"],
  ["third_party/a.cc", "Generated & vendored"],
  ["tests/node_modules/a/index.js", "Generated & vendored"],
  ["dist/index.js", "Generated & vendored"],
  ["build/index.js", "Generated & vendored"],
  ["static/a.min.js", "Generated & vendored"],
  ["src/a.js.map", "Generated & vendored"],
  ["packages/ai/openai/src/Generated.ts", "Generated & vendored"],
  ["mlx/generated.c", "Generated & vendored"],
  ["src/__generated__/a.ts", "Generated & vendored"],
  ["api/a.pb.go", "Generated & vendored"],
  ["api/a_pb2.py", "Generated & vendored"],
  [".yarn/releases/yarn.cjs", "Generated & vendored"],
  // Not to be taken for generated or built things.
  ["src/regenerated.ts", "Production"],
  ["src/rebuild/index.ts", "Production"],
  ["packages/redist/index.ts", "Production"],
  // Other: nothing recognizes it, and it is not code.
  ["package.json", "Other"],
  ["LICENSE", "Other"],
  ["server.log", "Other"],
  ["pyproject.toml", "Other"],
  [".github/renovate.json", "Other"],
  ["migration/annotations/a.yaml", "Other"],
])("%s is %s", (filePath, label) => {
  expect(classify(filePath).label).toBe(label);
});

test("a bin holds source files or others, never both", () => {
  const sourceLabels = all
    .filter((purpose) => purpose.source)
    .map((purpose) => purpose.label);
  expect(sourceLabels).toStrictEqual([
    "Production",
    "Tests",
    "Docs",
    "Examples",
    "Tooling",
    "AI instructions",
  ]);
  expect(classify("tests/a.ts").source).toBe(true);
  expect(classify("tests/a.snap").source).toBe(false);
});

test("every built-in purpose has its place in the stack, Other on top", () => {
  expect(all).toHaveLength(Object.keys(builtInFilePurposeDetails).length);
  expect(all.at(-1)?.label).toBe("Other");
});

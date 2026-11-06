import type { BuiltInFilePurpose } from "../../../config.ts";
import { extensionOf, sourceExtensions } from "../languages.ts";

/**
 * Bump whenever {@link builtInPurposeOf} changes which files are source: it is
 * part of what tells `scan` to look at every commit's source files again.
 */
export const builtInRulesVersion = "1";

const lockfileNames = new Set([
  "bun.lockb",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
]);

const vendoredFolders = new Set([
  ".yarn",
  "node_modules",
  "third-party",
  "third_party",
]);

/**
 * Names that mean build output or vendored code at the top of a project, and
 * nothing of the sort among its sources: `dist/index.js` against
 * `packages/next/src/build/webpack-config.ts`, or `src/go/build/build.go`.
 */
const outputFolders = new Set(["build", "dist", "vendor", "vendors"]);

/** Folders whose contents are named for what the code does rather than what it is. */
const sourceRootFolders = new Set([
  "cmd",
  "internal",
  "lib",
  "libs",
  "pkg",
  "scripts",
  "source",
  "sources",
  "src",
  "tools",
]);

/** Below these, folders are package names: `com/example/demo`, `devtools/build`. */
const packageRootFolders = new Set(["java", "kotlin", "scala"]);

/** Whether a folder of one of these names sits outside any source root. */
const inProjectLayout = (
  folders: readonly string[],
  names: ReadonlySet<string>,
): boolean => {
  for (const folder of folders) {
    if (names.has(folder)) {
      return true;
    }
    if (sourceRootFolders.has(folder)) {
      return false;
    }
  }
  return false;
};

/** A whole word of a file or folder name: `generated.c`, `__Generated.yaml`, `generated-client/`. */
const generatedWord = /(?:^|[._-])generated(?:[._-]|$)/i;

const machineMadeFileName =
  /\.lock$|\.map$|\.min\.[^.]+$|\.(?:g|gen)\.[^.]+$|\.pb(?:\.[a-z]+)*\.[^.]+$|_pb2(?:_grpc)?\.pyi?$|_gen\.go$|\.designer\.cs$/i;

const agentFolders = new Set([
  ".agent",
  ".agents",
  ".ai",
  ".aider",
  ".amazonq",
  ".claude",
  ".clinerules",
  ".codex",
  ".continue",
  ".cursor",
  ".gemini",
  ".junie",
  ".kiro",
  ".opencode",
  ".roo",
  ".windsurf",
]);

/** Exactly these spellings: `docs/providers/claude.md` is about Claude, not for it. */
const agentFileName = /^(?:AGENTS|CLAUDE|GEMINI)(?:\.local)?\.md$|^SKILL\.md$/;

/** Instructions that have no extension to tell them by. */
const agentRulesFileName = /^\.(?:clinerules|cursorrules|windsurfrules)$/;

const copilotPath =
  /^\.github\/(?:copilot-instructions\.md|agents\/|chatmodes\/|instructions\/|prompts\/|skills\/)/;

const rootSkillsDocument = /^skills\/.*\.md$/i;

/** Checked ahead of tests, so `.github/workflows/test.yml` stays CI. */
const ciFolders = new Set([
  ".azure-pipelines",
  ".buildkite",
  ".ci",
  ".circleci",
  ".devcontainer",
  ".github",
  ".gitlab",
  ".husky",
  ".idea",
  ".vscode",
]);

const ciFileName =
  /^(?:\.gitlab-ci|\.travis|appveyor|azure-pipelines|bitbucket-pipelines|codecov|dependabot|renovate)\.ya?ml$/i;

const testFolders = new Set([
  "__fixtures__",
  "__mocks__",
  "__snapshots__",
  "bench",
  "benches",
  "benchmark",
  "benchmarks",
  "e2e",
  "fixture",
  "fixtures",
  "mocks",
  "test-d",
  "testdata",
  "testutil",
  "testutils",
  "typetest",
  "typetests",
]);

/** Mean tests at the top of a project, and may well be the project lower down. */
const rootTestFolders = new Set(["cypress", "playwright", "t"]);

const specFolders = new Set(["spec"]);

/**
 * `test`, `__tests__`, `tests_integration`, `unit-tests`, `MyApp.Tests`,
 * `androidTest` (folders are compared in lower case) — and not
 * `react-test-renderer`, `test_runner`, `test-result` or `ab-test`.
 */
const testFolderName =
  /^_*tests?_*$|^_*tests[-_]|^test[-_](?:cases?|data|fixtures?|helpers?|resources|support|suite|utils?)$|[-_.]tests_*$|\.test$|(?:acceptance|api|e2e|functional|integration|regression|smoke|system|unit)[-_]?tests?_*$|(?:android|common|ios|js|jvm|native)test$/;

const dottedTestFileName =
  /\.(?:bench|benchmark|cy|e2e|spec|test|tests)(?:\.[^.]+)?\.[^.]+$|\.(?:test-d|tst)\.[^.]+$/i;

/** `routes_test.go`, `test_bert.py`, `test.c`, `FooTests.cs`: in code files only. */
const wordyTestFileName =
  /[_-](?:bench|benchmark|e2e|spec|test|tests)\.[^.]+$|^(?:bench|benchmark|test|tests)_.+|^tests?\.[^.]+$/i;

const camelCaseTestFileName = /[0-9a-z](?:Spec|Tests?)\.[^.]+$/;

const proseOrDataFileName = /\.(?:adoc|json|md|mdx|rst|toml|txt|ya?ml)$/i;

const isTestFileName = (fileName: string): boolean =>
  fileName === "conftest.py" ||
  dottedTestFileName.test(fileName) ||
  (!proseOrDataFileName.test(fileName) &&
    (wordyTestFileName.test(fileName) || camelCaseTestFileName.test(fileName)));

const exampleFolders = new Set([
  ".storybook",
  "demo",
  "demos",
  "example",
  "examples",
  "playground",
  "playgrounds",
  "samples",
  "stories",
  "storybook",
]);

const exampleFileName = /\.stories\.[^.]+$/i;

const docsFolders = new Set([
  ".changeset",
  "ai-docs",
  "changelog_unreleased",
  "doc",
  "docs",
  "documentation",
]);

const documentFileName = /\.(?:adoc|mdx?|rst)$/i;

const toolingFolders = new Set([
  "ci",
  "cmake",
  "deploy",
  "docker",
  "flow-typed",
  "grunt",
  "hack",
  "k8s",
  "script",
  "scripts",
  "terraform",
]);

const toolingFileName =
  /\.(?:conf|config)\.[cm]?[jt]s$|^\.[a-z-]+rc\.[cm]?[jt]s$|^(?:fabfile|gruntfile|gulpfile|noxfile|setup)\.(?:cjs|js|mjs|py|ts)$|^docker-compose.*\.ya?ml$/i;

const rootToolingFile = /^[^/]+\.(?:sh|ya?ml)$/i;

const assetFileName =
  /\.(?:avif|bin|bmp|dll|dylib|eot|exe|gif|gz|icns|ico|jar|jpe?g|model|mov|mp[34]|ogg|otf|pdf|pem|png|so|svg|tar|tgz|tiff?|ttf|wasm|wav|webm|webp|woff2?|zip)$/i;

const yamlFileName = /\.ya?ml$/i;

/**
 * Bins a file by what its path says it is for: the purposes that sort by path
 * alone, whatever the file's extension turns out to be.
 */
const purposeByPath = (
  filePath: string,
  folders: readonly string[],
  fileName: string,
): BuiltInFilePurpose | undefined => {
  const inAny = (names: ReadonlySet<string>) =>
    folders.some((folder) => names.has(folder));
  if (
    inAny(agentFolders) ||
    agentFileName.test(fileName) ||
    agentRulesFileName.test(fileName) ||
    copilotPath.test(filePath) ||
    rootSkillsDocument.test(filePath)
  ) {
    return "ai-instructions";
  }
  if (inAny(ciFolders) || ciFileName.test(fileName)) {
    return "tooling";
  }
  if (
    inAny(testFolders) ||
    rootTestFolders.has(folders[0] ?? "") ||
    inProjectLayout(folders, specFolders) ||
    folders.some((folder) => testFolderName.test(folder)) ||
    isTestFileName(fileName)
  ) {
    return "tests";
  }
  if (inAny(exampleFolders) || exampleFileName.test(fileName)) {
    return "examples";
  }
  if (
    inAny(docsFolders) ||
    folders[0] === "website" ||
    documentFileName.test(fileName)
  ) {
    return "docs";
  }
  if (
    inProjectLayout(folders, toolingFolders) ||
    toolingFileName.test(fileName) ||
    rootToolingFile.test(filePath)
  ) {
    return "tooling";
  }
  return undefined;
};

/**
 * The built-in classification. Three steps, in this order: what no one wrote by
 * hand; what has no source extension; then source files by their path. That
 * order is what makes every bin wholly source or wholly not.
 */
export const builtInPurposeOf = (filePath: string): BuiltInFilePurpose => {
  const segments = filePath.split("/");
  const fileName = segments.at(-1) ?? "";
  const allFolders = segments.slice(0, -1).map((name) => name.toLowerCase());
  const packageRootIndex = allFolders.findIndex((folder) =>
    packageRootFolders.has(folder),
  );
  const folders =
    packageRootIndex === -1
      ? allFolders
      : allFolders.slice(0, packageRootIndex + 1);

  if (
    lockfileNames.has(fileName) ||
    machineMadeFileName.test(fileName) ||
    folders.some((folder) => generatedWord.test(folder)) ||
    // A test of generated code, or a document about it, is not generated itself.
    (generatedWord.test(fileName) &&
      !isTestFileName(fileName) &&
      !documentFileName.test(fileName)) ||
    folders.some((folder) => vendoredFolders.has(folder)) ||
    inProjectLayout(folders, outputFolders)
  ) {
    return "generated-and-vendored";
  }

  const byPath = purposeByPath(filePath, folders, fileName);
  if (
    !sourceExtensions.has(extensionOf(filePath)) &&
    !agentRulesFileName.test(fileName)
  ) {
    if (byPath === "tests") {
      return "test-data";
    }
    return assetFileName.test(fileName) ? "assets" : "other";
  }
  // YAML no rule recognizes is data rather than code that ships.
  return byPath ?? (yamlFileName.test(fileName) ? "other" : "production");
};

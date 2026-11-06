import type { BuiltInFilePurpose } from "../../../config.ts";
import { sourceExtensions } from "../languages.ts";

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
  "dist",
  "node_modules",
  "third-party",
  "third_party",
  "vendor",
  "vendors",
]);

/** A whole word of a file or folder name: `generated.c`, `__Generated.yaml`, `generated-client/`. */
const generatedWord = /(?:^|[._-])generated(?:[._-]|$)/i;

const machineMadeFileName =
  /\.lock$|\.map$|\.min\.[^.]+$|\.(?:gen|pb)\.[^.]+$|_pb2\.py$/i;

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

const agentFileName = /^(?:agents|claude|gemini)(?:\.local)?\.md$|^skill\.md$/i;

/** Instructions that have no extension to tell them by. */
const agentRulesFileName = /^\.(?:clinerules|cursorrules|windsurfrules)$/;

const copilotPath =
  /^\.github\/(?:copilot-instructions\.md|agents\/|chatmodes\/|instructions\/|prompts\/|skills\/)/;

const skillsDocument = /(?:^|\/)skills\/.*\.md$/i;

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
  "cypress",
  "e2e",
  "fixture",
  "fixtures",
  "mocks",
  "playwright",
  "spec",
  "test-d",
  "testdata",
  "testutil",
  "testutils",
  "typetest",
  "typetests",
]);

/** `test`, `__tests__`, `tests_integration`, `unit-tests` — not `react-test-renderer`. */
const testFolderName = /^_*tests?(?:[-_].*)?$|[-_]tests?_*$/i;

const testFileName =
  /[._-](?:bench|benchmark|e2e|spec|test|tests)(?:\.[^.]+)?\.[^.]+$|\.(?:test-d|tst)\.[^.]+$|^(?:bench|benchmark|test|tests)_.+\.py$|^conftest\.py$/i;

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
  "blog",
  "changelog_unreleased",
  "doc",
  "docs",
  "documentation",
  "i18n",
  "website",
]);

const markdownFileName = /\.mdx?$/i;

const toolingFolders = new Set([
  "ci",
  "cmake",
  "deploy",
  "docker",
  "flow-typed",
  "grunt",
  "k8s",
  "script",
  "scripts",
  "terraform",
]);

const toolingFileName =
  /\.(?:conf|config)\.[cm]?[jt]s$|^\.[a-z-]+rc\.[cm]?[jt]s$|^(?:fabfile|gruntfile|gulpfile|noxfile|rollup|setup|webpack)\.(?:cjs|js|mjs|py|ts)$|^docker-compose.*\.ya?ml$/i;

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
    skillsDocument.test(filePath)
  ) {
    return "ai-instructions";
  }
  if (inAny(ciFolders) || ciFileName.test(fileName)) {
    return "tooling";
  }
  if (
    inAny(testFolders) ||
    folders.some((folder) => testFolderName.test(folder)) ||
    testFileName.test(fileName)
  ) {
    return "tests";
  }
  if (inAny(exampleFolders) || exampleFileName.test(fileName)) {
    return "examples";
  }
  if (inAny(docsFolders) || markdownFileName.test(fileName)) {
    return "docs";
  }
  if (
    inAny(toolingFolders) ||
    toolingFileName.test(fileName) ||
    rootToolingFile.test(filePath)
  ) {
    return "tooling";
  }
  return undefined;
};

const extensionOf = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : "";
};

/**
 * The built-in classification. Three steps, in this order: what no one wrote by
 * hand; what has no source extension; then source files by their path. That
 * order is what makes every bin wholly source or wholly not.
 */
export const builtInPurposeOf = (filePath: string): BuiltInFilePurpose => {
  const segments = filePath.split("/");
  const fileName = segments.at(-1) ?? "";
  const folders = segments.slice(0, -1).map((name) => name.toLowerCase());

  if (
    lockfileNames.has(fileName) ||
    machineMadeFileName.test(fileName) ||
    [...folders, fileName].some((name) => generatedWord.test(name)) ||
    folders.some((folder) => vendoredFolders.has(folder)) ||
    // `scripts/build/` holds hand-written build scripts, not build output.
    (folders.includes("build") && !folders.includes("scripts"))
  ) {
    return "generated-and-vendored";
  }

  const byPath = purposeByPath(filePath, folders, fileName);
  if (
    !sourceExtensions.has(extensionOf(fileName)) &&
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

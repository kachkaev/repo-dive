/**
 * Reports how big the publishable npm package is, and how that compares with
 * the baseline recorded by the most recent run on `main`.
 *
 * `npm pack --dry-run` measures the real tarball without writing it to disk;
 * `--ignore-scripts` keeps `prepack` from rebuilding, so the numbers describe
 * whatever is currently in `dist/`. Run `pnpm build` first.
 *
 * In CI the baseline travels between runs as a GitHub Actions cache that only
 * runs on `main` write to, so a pull request compares against the latest `main`
 * rather than against its own previous run.
 */

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const baselineFilePath = "node_modules/.cache/package-size/baseline.json";

/** Vite fingerprints these, so their file names differ between any two builds. */
const assetDirectory = "dist/dashboard/assets/";
const assetHashLength = 8;

const byteUnits = ["B", "kB", "MB", "GB"] as const;

const maximumFileRows = 30;

type NpmPackResult = {
  files: Array<{ path: string; size: number }>;
  name: string;
  size: number;
  unpackedSize: number;
  version: string;
};

type Measurement = {
  commit?: string | undefined;
  files: Array<{ path: string; size: number }>;
  name: string;
  packedSize: number;
  unpackedSize: number;
  version: string;
};

function measure(): Measurement {
  const stdout = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );

  const [result] = JSON.parse(stdout) as NpmPackResult[];
  if (!result) {
    throw new Error("`npm pack --json` did not report any package");
  }

  return {
    commit: process.env["GITHUB_SHA"],
    files: result.files.map(({ path: filePath, size }) => ({
      path: filePath,
      size,
    })),
    name: result.name,
    packedSize: result.size,
    unpackedSize: result.unpackedSize,
    version: result.version,
  };
}

function readBaseline(): Measurement | undefined {
  try {
    return JSON.parse(readFileSync(baselineFilePath, "utf8")) as Measurement;
  } catch {
    // A missing or corrupted cache entry just means there is nothing to
    // compare against — never a reason to fail the run.
    return undefined;
  }
}

function writeBaseline(measurement: Measurement): void {
  mkdirSync(path.dirname(baselineFilePath), { recursive: true });
  writeFileSync(
    baselineFilePath,
    `${JSON.stringify(measurement, undefined, 2)}\n`,
  );
}

function formatBytes(bytes: number): string {
  let value = bytes;
  let unitIndex = 0;
  while (Math.abs(value) >= 1000 && unitIndex < byteUnits.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const unit = byteUnits[unitIndex] ?? "B";

  return unitIndex === 0 ? `${value} ${unit}` : `${value.toFixed(1)} ${unit}`;
}

function formatByteDelta(
  current: number,
  baseline: number | undefined,
): string {
  if (baseline === undefined) {
    return "new";
  }

  const delta = current - baseline;
  if (delta === 0) {
    return "=";
  }

  const sign = delta > 0 ? "+" : "-";
  const percentage =
    baseline === 0
      ? ""
      : ` (${sign}${((Math.abs(delta) / baseline) * 100).toFixed(1)}%)`;

  return `${sign}${formatBytes(Math.abs(delta))}${percentage}`;
}

function formatCountDelta(current: number, baseline: number): string {
  const delta = current - baseline;

  return delta === 0 ? "=" : `${delta > 0 ? "+" : "-"}${Math.abs(delta)}`;
}

/**
 * Folds the fingerprint out of an asset name (`index-<hash>.js` becomes
 * `index-*.js`) so it can be matched against its counterpart in the baseline.
 * The hash itself may end in `-`, so it is cut by length rather than by
 * looking for the last hyphen.
 */
function toComparablePath(filePath: string): string {
  if (!filePath.startsWith(assetDirectory)) {
    return filePath;
  }

  const extensionIndex = filePath.indexOf(".", assetDirectory.length);
  const hashIndex = extensionIndex - assetHashLength - 1;
  if (
    extensionIndex === -1 ||
    hashIndex <= assetDirectory.length ||
    filePath[hashIndex] !== "-"
  ) {
    return filePath;
  }

  return `${filePath.slice(0, hashIndex)}-*${filePath.slice(extensionIndex)}`;
}

function renderFileRows(
  current: Measurement,
  baseline: Measurement | undefined,
): string[] {
  const baselineSizes = new Map(
    baseline?.files.map((file) => [toComparablePath(file.path), file.size]),
  );

  const rows: string[] = [];

  const sortedFiles = current.files.toSorted((a, b) => b.size - a.size);
  for (const file of sortedFiles.slice(0, maximumFileRows)) {
    const comparablePath = toComparablePath(file.path);
    const delta = baseline
      ? formatByteDelta(file.size, baselineSizes.get(comparablePath))
      : "—";
    rows.push(
      `| \`${comparablePath}\` | ${formatBytes(file.size)} | ${delta} |`,
    );
    baselineSizes.delete(comparablePath);
  }

  const hiddenFileCount = sortedFiles.length - maximumFileRows;
  if (hiddenFileCount > 0) {
    rows.push(`| … and ${hiddenFileCount} more | | |`);
  }

  for (const [comparablePath, size] of baselineSizes) {
    rows.push(
      `| ~~\`${comparablePath}\`~~ | — | gone (was ${formatBytes(size)}) |`,
    );
  }

  return rows;
}

function renderBaselineNote(baseline: Measurement | undefined): string {
  if (!baseline) {
    return "No baseline to compare against yet — this run records one for the next.";
  }

  const origin = baseline.commit
    ? `commit \`${baseline.commit.slice(0, 7)}\``
    : "an earlier local run";

  return `Baseline: \`${baseline.name}@${baseline.version}\` from ${origin}.`;
}

function renderReport(
  current: Measurement,
  baseline: Measurement | undefined,
): string {
  return [
    "## 📦 npm package size",
    "",
    `\`${current.name}@${current.version}\` — what \`npm publish\` would upload.`,
    "",
    "| | Size | vs baseline |",
    "| --- | ---: | ---: |",
    `| Packed (tarball) | ${formatBytes(current.packedSize)} | ${baseline ? formatByteDelta(current.packedSize, baseline.packedSize) : "—"} |`,
    `| Unpacked | ${formatBytes(current.unpackedSize)} | ${baseline ? formatByteDelta(current.unpackedSize, baseline.unpackedSize) : "—"} |`,
    `| Files | ${current.files.length} | ${baseline ? formatCountDelta(current.files.length, baseline.files.length) : "—"} |`,
    "",
    "| File | Size | vs baseline |",
    "| --- | ---: | ---: |",
    ...renderFileRows(current, baseline),
    "",
    renderBaselineNote(baseline),
  ].join("\n");
}

const currentMeasurement = measure();
const report = renderReport(currentMeasurement, readBaseline());

process.stdout.write(`${report}\n`);

const stepSummaryFilePath = process.env["GITHUB_STEP_SUMMARY"];
if (stepSummaryFilePath) {
  appendFileSync(stepSummaryFilePath, `${report}\n`);
}

writeBaseline(currentMeasurement);

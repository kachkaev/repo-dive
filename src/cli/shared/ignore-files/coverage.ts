/**
 * Whether an ignore file already sends its tool past the catalog.
 *
 * Deciding that means reading patterns the way git reads them — almost. This
 * is not a gitignore engine, and does not try to become one: it recognizes the
 * handful of forms people actually write.
 */

/**
 * Strips the decoration that does not change which path a pattern points at.
 * A trailing `/*` or `/**` goes with it: to git those leave the directory
 * itself unignored, but everything a tool would walk into is gone either way.
 */
const normalizePattern = (pattern: string): string =>
  pattern
    .trim()
    .replace(/^\.?\//, "")
    .replace(/\/$/, "")
    .replace(/\/\*+$/, "");

/**
 * Whether an ignore file's `contents` plainly cover `relativePath` (a
 * repository-root-relative POSIX path with no trailing slash).
 *
 * Leans towards answering "covered". A missed warning costs a user nothing; one
 * that nags about an entry already sitting in the file would turn the whole
 * check into something to switch off.
 */
export const coversPath = (contents: string, relativePath: string): boolean => {
  const segments = relativePath.split("/");
  const selfOrAncestors = new Set(
    segments.map((_, index) => segments.slice(0, index + 1).join("/")),
  );

  // Later lines win: a re-including `!` after a broad `*` genuinely un-ignores.
  let covered = false;
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const negated = trimmed.startsWith("!");
    const pattern = normalizePattern(negated ? trimmed.slice(1) : trimmed);
    const anchored = pattern.replace(/^\*\*\//, "");
    const wildcardIndex = anchored.search(/[*?[]/);
    const literalPrefix = anchored.slice(0, wildcardIndex);
    if (
      pattern === "*" ||
      pattern === "**" ||
      selfOrAncestors.has(pattern) ||
      selfOrAncestors.has(anchored) ||
      // A pattern with no slash matches a path component at any depth.
      (!pattern.includes("/") && segments.includes(pattern)) ||
      // A wildcard makes the pattern unreadable to this non-engine, so it is
      // ambiguous; count it as covering when its literal beginning points at
      // the path (`.repo-*` does, `*.log` claims nothing).
      (wildcardIndex > 0 &&
        (relativePath.startsWith(literalPrefix) ||
          segments.some((segment) => segment.startsWith(literalPrefix))))
    ) {
      covered = !negated;
    }
  }

  return covered;
};

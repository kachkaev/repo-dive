/**
 * An ignore file is something a person wrote and will read again, so a line
 * added by a tool should look like they typed it themselves.
 *
 * This module reads how a file is written — comments, sections, ordering, how
 * paths are spelled — and returns it with the catalog listed in the same hand:
 * slotted into place in an alphabetical list, appended as a bare line to a
 * plain one, and introduced by a comment of its own only where the file is
 * already organized into commented sections.
 */

const isBlank = (line: string): boolean => line.trim() === "";
const isComment = (line: string): boolean => line.trim().startsWith("#");
const isPattern = (line: string): boolean => !isBlank(line) && !isComment(line);

/**
 * What decides where a pattern sits in an alphabetically ordered file: the path
 * it points at, with the decoration authors vary freely taken off — a leading
 * `!`, a leading slash or `**`, a trailing slash, letter case.
 */
const sortKey = (line: string): string =>
  line
    .trim()
    .replace(/^!/, "")
    .replace(/^(?:\.?\/|\*\*\/)/, "")
    .replace(/\/+$/, "")
    .toLowerCase();

type IgnoreFileStyle = {
  /** The line ending the file already uses. */
  readonly eol: "\n" | "\r\n";
  /** The `#` run that introduces comments (`#`, `##`, …); absent in a file with none. */
  readonly commentMarker: string | undefined;
  /** Blank lines split the patterns into groups. */
  readonly sectioned: boolean;
  /** The patterns run in alphabetical order, so a new one belongs in the middle. */
  readonly sorted: boolean;
  /** Paths are anchored to the repository root with a leading slash. */
  readonly anchored: boolean;
  /** Directories are spelled with a trailing slash. */
  readonly directorySlash: boolean;
};

/** Whether a blank line ever separates one pattern from a later one. */
const hasSections = (lines: readonly string[]): boolean => {
  let seenPattern = false;
  let blankSincePattern = false;
  for (const line of lines) {
    if (isPattern(line)) {
      if (seenPattern && blankSincePattern) {
        return true;
      }
      seenPattern = true;
      blankSincePattern = false;
    } else if (isBlank(line) && seenPattern) {
      blankSincePattern = true;
    }
  }
  return false;
};

const readIgnoreFileStyle = (contents: string): IgnoreFileStyle => {
  const lines = contents.split("\n");
  const patterns = lines.filter(isPattern).map((line) => line.trim());
  // Wildcards say nothing about how paths are spelled: `*.log` is never
  // anchored and never ends in a slash, whatever the file's habits are.
  const plain = patterns.filter((pattern) => !/[*?[]/.test(pattern));
  const spelling = plain.length > 0 ? plain : patterns;

  return {
    eol: contents.includes("\r\n") ? "\r\n" : "\n",
    commentMarker: /^#+/.exec(lines.find(isComment)?.trim() ?? "")?.[0],
    sectioned: hasSections(lines),
    sorted:
      patterns.length >= 2 &&
      patterns.every(
        (pattern, index) =>
          index === 0 || sortKey(patterns[index - 1] ?? "") <= sortKey(pattern),
      ),
    anchored:
      spelling.filter((pattern) => pattern.replace(/^!/, "").startsWith("/"))
        .length *
        2 >
      spelling.length,
    // Absent evidence, prefer the trailing slash: it narrows the pattern to a
    // directory, which is what the catalog is.
    directorySlash:
      spelling.length === 0 ||
      spelling.some((pattern) => pattern.endsWith("/")),
  };
};

/** Index just past the last line that carries something, ignoring trailing blanks. */
const endOfContent = (lines: readonly string[]): number => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!isBlank(lines[index] ?? "")) {
      return index + 1;
    }
  }
  return 0;
};

/** Index of the first pattern the entry sorts before, or the end of the file. */
const sortedPosition = (lines: readonly string[], entry: string): number => {
  const key = sortKey(entry);
  let seenPattern = false;
  for (const [index, line] of lines.entries()) {
    if (!isPattern(line)) {
      continue;
    }
    if (sortKey(line) > key) {
      // A comment sitting directly above a pattern introduces it, so the new
      // line goes before the comment rather than between the two. Comments at
      // the very top head the whole file and stay where they are.
      let position = index;
      while (
        seenPattern &&
        position > 0 &&
        isComment(lines[position - 1] ?? "")
      ) {
        position -= 1;
      }
      return position;
    }
    seenPattern = true;
  }
  return endOfContent(lines);
};

/**
 * The file's `contents` with the catalog listed in them, plus the exact line
 * that was added — the command reports it, since the spelling follows the file.
 *
 * Only ever call this on a file that does not cover the catalog yet.
 */
export const withIgnoreEntry = ({
  contents,
  catalogRelativePath,
}: {
  readonly contents: string;
  readonly catalogRelativePath: string;
}): { readonly contents: string; readonly entry: string } => {
  const style = readIgnoreFileStyle(contents);
  const entry = `${style.anchored ? "/" : ""}${catalogRelativePath}${
    style.directorySlash ? "/" : ""
  }`;

  // One flat alphabetical block: the entry belongs at its letter. Sorting is
  // only followed here — in a file cut into sections the same reasoning would
  // drop the line into a section it has nothing to do with.
  const slotIn = style.sorted && !style.sectioned;

  // A file kept in commented sections gets one more section; anywhere else a
  // blank line and a comment around a single pattern are more ceremony than the
  // line deserves.
  const addition =
    !slotIn && style.sectioned && style.commentMarker !== undefined
      ? ["", `${style.commentMarker} repo-dive catalog`, entry]
      : [entry];

  // A last line left without a line ending gets the file's own one first, so
  // that splicing happens between whole lines — appending afterwards would put
  // a bare `\n` where the file uses `\r\n`, and a second `\r` after the entry.
  const terminated =
    contents === "" || contents.endsWith("\n")
      ? contents
      : `${contents}${style.eol}`;

  const lines = terminated.split("\n");
  const carriageReturn = style.eol === "\r\n" ? "\r" : "";
  lines.splice(
    slotIn ? sortedPosition(lines, entry) : endOfContent(lines),
    0,
    ...addition.map((line) => `${line}${carriageReturn}`),
  );

  return { contents: lines.join("\n"), entry };
};

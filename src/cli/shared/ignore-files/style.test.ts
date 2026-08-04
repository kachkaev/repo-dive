import { expect, test } from "@effect/vitest";

import { coversPath } from "./coverage.ts";
import { withIgnoreEntry } from "./style.ts";

const add = (contents: string, catalogRelativePath = ".repo-dive") =>
  withIgnoreEntry({ contents, catalogRelativePath });

test("withIgnoreEntry appends a bare line to a plain list", () => {
  expect(add("node_modules\ndist\n").contents).toBe(
    "node_modules\ndist\n.repo-dive\n",
  );
});

test("withIgnoreEntry starts a list that is not there yet", () => {
  expect(add("").contents).toBe(".repo-dive/\n");
});

test("withIgnoreEntry ends the file with a newline it did not have", () => {
  expect(add("node_modules").contents).toBe("node_modules\n.repo-dive\n");
});

test("withIgnoreEntry keeps the entry above trailing blank lines", () => {
  expect(add("node_modules\n\n").contents).toBe("node_modules\n.repo-dive\n\n");
});

test("withIgnoreEntry gives a file kept in commented sections one more", () => {
  expect(
    add("## Dependencies\n/node_modules/\n\n## Build\n/dist/\n").contents,
  ).toBe(
    "## Dependencies\n/node_modules/\n\n## Build\n/dist/\n\n## repo-dive catalog\n/.repo-dive/\n",
  );
});

test("withIgnoreEntry does not open a section in a file that has none", () => {
  // Comments without sections, and sections without comments, both stay plain:
  // a heading over a single pattern is more ceremony than the line deserves.
  expect(add("# what CI skips\nnode_modules\ndist\n").contents).toBe(
    "# what CI skips\nnode_modules\ndist\n.repo-dive\n",
  );
  expect(add("node_modules\n\ndist\n").contents).toBe(
    "node_modules\n\ndist\n.repo-dive\n",
  );
});

test("withIgnoreEntry slots into an alphabetical list", () => {
  expect(add(".DS_Store\ncoverage/\ndist/\nnode_modules/\n").contents).toBe(
    ".DS_Store\n.repo-dive/\ncoverage/\ndist/\nnode_modules/\n",
  );
  // Sorting that runs out before the entry leaves it at the end, still in order.
  expect(add("build\ncoverage\ndist\n", "tmp/dive").contents).toBe(
    "build\ncoverage\ndist\ntmp/dive\n",
  );
});

test("withIgnoreEntry reads sorting through the decoration around patterns", () => {
  expect(add("!/.config/keep\n/coverage/\n/node_modules/\n").contents).toBe(
    "!/.config/keep\n/.repo-dive/\n/coverage/\n/node_modules/\n",
  );
});

test("withIgnoreEntry keeps a comment with the pattern it introduces", () => {
  expect(add("# apple\napple\n# damson\ndamson\n", "cherry").contents).toBe(
    "# apple\napple\ncherry\n# damson\ndamson\n",
  );
});

test("withIgnoreEntry leaves a heading at the top of the file", () => {
  expect(add("# generated, do not edit\nyak\nzoo\n", "aardvark").contents).toBe(
    "# generated, do not edit\naardvark\nyak\nzoo\n",
  );
});

test("withIgnoreEntry does not read an unsorted list as sorted", () => {
  expect(add("node_modules\ndist\ncoverage\n").contents).toBe(
    "node_modules\ndist\ncoverage\n.repo-dive\n",
  );
});

test("withIgnoreEntry spells the path the way the file spells paths", () => {
  // Anchored to the root, directories marked with a trailing slash.
  expect(add("/node_modules/\n/dist/\n").entry).toBe("/.repo-dive/");
  // Bare names, no trailing slashes — a wildcard says nothing either way.
  expect(add("node_modules\ndist\n*.log\n").entry).toBe(".repo-dive");
  // A minority of anchored paths does not make the file's style anchored.
  expect(add("/node_modules\ndist\ncoverage\n").entry).toBe(".repo-dive");
  // Nothing to go by: the trailing slash narrows the pattern to a directory,
  // which is what the catalog is.
  expect(add("").entry).toBe(".repo-dive/");
});

test("withIgnoreEntry keeps a CRLF file on CRLF", () => {
  expect(add("node_modules\r\ndist\r\n").contents).toBe(
    "node_modules\r\ndist\r\n.repo-dive\r\n",
  );
  expect(
    add("## Dependencies\r\n/node_modules/\r\n\r\n## Build\r\n/dist/\r\n")
      .contents,
  ).toBe(
    "## Dependencies\r\n/node_modules/\r\n\r\n## Build\r\n/dist/\r\n\r\n## repo-dive catalog\r\n/.repo-dive/\r\n",
  );
  // The line the file was missing is a \r\n too, not a bare \n and a stray \r.
  expect(add("node_modules\r\ndist").contents).toBe(
    "node_modules\r\ndist\r\n.repo-dive\r\n",
  );
});

test("withIgnoreEntry writes something coversPath then recognizes", () => {
  for (const before of [
    "",
    "node_modules",
    "node_modules\ndist\n",
    "/node_modules/\n/dist/\n",
    "node_modules\ndist\n*.log\n",
    "## Dependencies\n/node_modules/\n\n## Build\n/dist/\n",
    ".DS_Store\ncoverage/\ndist/\nnode_modules/\n",
    "node_modules\r\ndist\r\n",
    "node_modules\r\ndist",
  ]) {
    const { contents } = add(before);
    expect(coversPath(contents, ".repo-dive"), before).toBe(true);
    expect(contents, before).not.toContain("\n\n\n");
  }
});

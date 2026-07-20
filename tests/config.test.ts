import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Effect } from "effect";

import { defineConfig } from "../src/config.ts";
import {
  defaultMaxInCharts,
  loadConfig,
  resolveConfig,
} from "../src/lib/config.ts";

void test("defineConfig returns its argument unchanged", () => {
  const config = { authors: { maxInCharts: 7 } };
  assert.equal(defineConfig(config), config);
});

void test("resolveConfig defaults with no author config", () => {
  const resolved = resolveConfig({});
  assert.equal(resolved.maxInCharts, defaultMaxInCharts);
  const author = resolved.resolveAuthor("carol@example.com");
  assert.equal(author.label, "carol@example.com");
  assert.equal(author.canonicalEmail, "carol@example.com");
  assert.equal(author.displayName, undefined);
  assert.equal(author.url, undefined);
});

void test("resolveConfig folds aliases into the first (canonical) entry", () => {
  const resolved = resolveConfig({
    authors: {
      aliases: [
        [
          "alice@work.example",
          "alice@personal.example",
          "12345+alice@users.noreply.github.com",
        ],
      ],
    },
  });
  assert.equal(
    resolved.resolveAuthor("alice@personal.example").label,
    "alice@work.example",
  );
  assert.equal(
    resolved.resolveAuthor("12345+alice@users.noreply.github.com").label,
    "alice@work.example",
  );
  // Canonical stays itself.
  assert.equal(
    resolved.resolveAuthor("alice@work.example").label,
    "alice@work.example",
  );
});

void test("resolveConfig matches aliases case-insensitively", () => {
  const resolved = resolveConfig({
    authors: { aliases: [["Alice@Work.Example", "alice@personal.example"]] },
  });
  assert.equal(
    resolved.resolveAuthor("ALICE@personal.EXAMPLE").label,
    "Alice@Work.Example",
  );
});

void test("resolveConfig still prettifies a canonical noreply address", () => {
  const resolved = resolveConfig({});
  assert.equal(
    resolved.resolveAuthor("12345+bob@users.noreply.github.com").label,
    "bob",
  );
});

void test("resolveConfig applies displayName and url from a rich alias group", () => {
  const resolved = resolveConfig({
    authors: {
      aliases: [
        {
          emails: ["alice@work.example", "alice@personal.example"],
          displayName: "Alice",
          url: "https://github.com/alice",
        },
      ],
    },
  });
  const author = resolved.resolveAuthor("alice@personal.example");
  assert.equal(author.label, "Alice");
  assert.equal(author.displayName, "Alice");
  assert.equal(author.url, "https://github.com/alice");
  // The email column still shows the (prettified) canonical email.
  assert.equal(author.canonicalEmail, "alice@work.example");
});

void test("resolveConfig matches an alias by its prettified noreply handle", () => {
  // Config lists the handle a user sees in the report; the raw commit email is
  // the full GitHub noreply address.
  const resolved = resolveConfig({
    authors: {
      aliases: [{ emails: ["ziggy"], displayName: "Ziggy" }],
    },
  });
  const author = resolved.resolveAuthor("98765+ziggy@users.noreply.github.com");
  assert.equal(author.label, "Ziggy");
  assert.equal(author.displayName, "Ziggy");
});

void test("resolveConfig rejects malformed config", () => {
  assert.throws(
    () => resolveConfig({ authors: "nope" }),
    /`authors` must be an object/,
  );
  assert.throws(
    () => resolveConfig({ authors: { aliases: "nope" } }),
    /`authors.aliases` must be an array/,
  );
  assert.throws(
    () => resolveConfig({ authors: { aliases: [[]] } }),
    /must be a non-empty array/,
  );
  assert.throws(
    () => resolveConfig({ authors: { aliases: [[""]] } }),
    /must be a non-empty string/,
  );
  assert.throws(
    () => resolveConfig({ authors: { maxInCharts: 0 } }),
    /must be an integer between 1 and 100/,
  );
  assert.throws(
    () => resolveConfig({ authors: { maxInCharts: 3.5 } }),
    /must be an integer between 1 and 100/,
  );
});

void test("resolveConfig rejects an email shared across alias groups", () => {
  assert.throws(
    () =>
      resolveConfig({
        authors: {
          aliases: [
            ["alice@work.example", "shared@example.com"],
            ["bob@work.example", "shared@example.com"],
          ],
        },
      }),
    /appears in more than one alias group/,
  );
});

void test("loadConfig returns defaults when no config file exists", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "repo-insighter-cfg-"));
  try {
    const resolved = await Effect.runPromise(loadConfig(dir));
    assert.equal(resolved.maxInCharts, defaultMaxInCharts);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

void test("loadConfig imports a .mjs config file", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "repo-insighter-cfg-"));
  try {
    writeFileSync(
      path.join(dir, "repo-insighter.config.mjs"),
      'export default { authors: { maxInCharts: 15, aliases: [["a@x.example", "a@y.example"]] } };\n',
    );
    const resolved = await Effect.runPromise(loadConfig(dir));
    assert.equal(resolved.maxInCharts, 15);
    assert.equal(resolved.resolveAuthor("a@y.example").label, "a@x.example");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

void test("loadConfig fails with a friendly message on a malformed config", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "repo-insighter-cfg-"));
  try {
    writeFileSync(
      path.join(dir, "repo-insighter.config.mjs"),
      "export default { authors: { maxInCharts: -1 } };\n",
    );
    await assert.rejects(
      Effect.runPromise(loadConfig(dir)),
      /Invalid repo-insighter config/,
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

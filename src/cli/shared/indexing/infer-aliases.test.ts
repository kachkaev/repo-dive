import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { resolveConfig } from "../config.ts";
import { inferAliases } from "./infer-aliases.ts";

const resolverFor = (
  authors: ReadonlyArray<readonly [name: string, email: string]>,
  rawConfig: unknown = {},
) =>
  inferAliases(
    resolveConfig(rawConfig, path.join(os.tmpdir(), "repo-dive-fake-repo"))
      .resolveContributor,
    authors.map(([name, email]) => ({ name, email })),
  );

test("inferAliases joins a single-word name to the noreply handle it spells", () => {
  const resolve = resolverFor([
    ["Alice Example", "alice@users.noreply.github.com"],
    ["alice", "alice@example.com"],
    ["alice", "alice@example.com"],
  ]);
  // Both resolve through the address committed under most
  expect(resolve("alice@users.noreply.github.com").canonicalEmail).toBe(
    "alice@example.com",
  );
  expect(resolve("alice@example.com").canonicalEmail).toBe("alice@example.com");
  // An address the history never saw resolves as before
  expect(resolve("carol@example.com").canonicalEmail).toBe("carol@example.com");
});

test("inferAliases joins the noreply addresses of one GitHub account", () => {
  const resolve = resolverFor([
    ["Alice Example", "12345+alice-old@users.noreply.github.com"],
    ["Alice Example", "12345+alice@users.noreply.github.com"],
    ["Alice Example", "12345+alice@users.noreply.github.com"],
  ]);
  expect(
    resolve("12345+alice-old@users.noreply.github.com").canonicalEmail,
  ).toBe("alice");
});

test("inferAliases folds transitively", () => {
  const resolve = resolverFor([
    ["Alice", "12345+alice@users.noreply.github.com"],
    ["alice", "alice@example.com"],
    ["alice", "alice@example.com"],
    ["alice", "12345+alice-old@users.noreply.github.com"],
  ]);
  expect(
    resolve("12345+alice-old@users.noreply.github.com").canonicalEmail,
  ).toBe("alice@example.com");
});

test("inferAliases never folds by a shared name alone", () => {
  const resolve = resolverFor([
    // One repository can hold two people with one full name
    ["Jason Miller", "jason@one.example"],
    ["Jason Miller", "jason@two.example"],
    ["Matt", "matt@one.example"],
    ["Matt", "matt@two.example"],
    // A key that looks like a handle, but whose address is not a noreply one
    ["Matt", "matt"],
  ]);
  expect(resolve("jason@two.example").canonicalEmail).toBe("jason@two.example");
  expect(resolve("matt@two.example").canonicalEmail).toBe("matt@two.example");
  expect(resolve("matt").canonicalEmail).toBe("matt");
});

test("inferAliases leaves bots and AI agents alone", () => {
  const resolve = resolverFor([
    ["renovate[bot]", "29139614+renovate[bot]@users.noreply.github.com"],
    ["renovate[bot]", "renovate@example.com"],
  ]);
  expect(resolve("renovate@example.com", "renovate[bot]").canonicalEmail).toBe(
    "renovate@example.com",
  );
});

test("inferAliases lets an alias group take in addresses it does not list", () => {
  const resolve = resolverFor(
    [
      ["Alice Example", "12345+alice@users.noreply.github.com"],
      ["alice", "alice@example.com"],
      ["alice", "alice@example.com"],
    ],
    {
      contributors: {
        aliases: [{ displayName: "Alice", emails: ["alice"] }],
      },
    },
  );
  // The group wins over the busier unlisted address
  const resolved = resolve("alice@example.com", "alice");
  expect(resolved.canonicalEmail).toBe("alice");
  expect(resolved.displayName).toBe("Alice");
});

test("inferAliases never merges two alias groups, nor joins an address to both", () => {
  const resolve = resolverFor(
    [
      ["Alice Example", "alice@users.noreply.github.com"],
      ["Alice Example", "12345+alice@users.noreply.github.com"],
      ["alice", "alice@example.com"],
      ["Bob Example", "12345+bob@users.noreply.github.com"],
      ["bob", "bob@example.com"],
    ],
    {
      contributors: {
        aliases: [
          { displayName: "Alice", emails: ["alice"] },
          { displayName: "Bob", emails: ["bob"] },
        ],
      },
    },
  );
  // One account ID spans both groups, yet each keeps its own people
  expect(resolve("12345+bob@users.noreply.github.com").displayName).toBe("Bob");
  expect(resolve("alice@users.noreply.github.com").displayName).toBe("Alice");
  // Linked to one group only, so each address joins its own
  expect(resolve("alice@example.com", "alice").displayName).toBe("Alice");
  expect(resolve("bob@example.com", "bob").displayName).toBe("Bob");
});

test("inferAliases leaves out an address linked to two alias groups", () => {
  const resolve = resolverFor(
    [
      ["Alice Example", "12345+alice@users.noreply.github.com"],
      ["Alice Example", "12345+alice-old@users.noreply.github.com"],
      ["Alice Example", "12345+alice-older@users.noreply.github.com"],
    ],
    {
      contributors: {
        aliases: [
          { displayName: "Alice (new)", emails: ["alice"] },
          { displayName: "Alice (old)", emails: ["alice-old"] },
        ],
      },
    },
  );
  // One account ID links the unlisted handle to both groups, so it joins
  // neither
  const resolved = resolve("12345+alice-older@users.noreply.github.com");
  expect(resolved.canonicalEmail).toBe("alice-older");
  expect(resolved.displayName).toBeUndefined();
});

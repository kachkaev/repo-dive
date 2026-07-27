import { expect, test } from "vitest";

import { deriveContributorKind } from "./config.ts";
import { parseIdentity } from "./indexing.ts";

test("parseIdentity splits a co-author trailer into name and email", () => {
  expect(parseIdentity("Claude Fable 5 <noreply@anthropic.com>")).toEqual({
    name: "Claude Fable 5",
    email: "noreply@anthropic.com",
  });
  expect(parseIdentity("  Alice  <alice@example.com>  ")).toEqual({
    name: "Alice",
    email: "alice@example.com",
  });
});

test("parseIdentity keeps a name-only trailer usable", () => {
  expect(parseIdentity("plain-name")).toEqual({
    name: "plain-name",
    email: "",
  });
  // An unclosed bracket is not an email — treat the whole line as a name
  // rather than swallowing the rest of it.
  expect(parseIdentity("Alice <alice@example.com")).toEqual({
    name: "Alice <alice@example.com",
    email: "",
  });
});

// Co-authors are classified by the very same derivation authors go through
// (this replaced a separate `isAiCoAuthor` heuristic), so a trailer has to
// survive the round trip through `parseIdentity` with its kind intact.
const kindOf = (trailer: string) => {
  const { name, email } = parseIdentity(trailer);
  return deriveContributorKind(`${name} <${email}>`);
};

test("a co-author trailer keeps its kind through parseIdentity", () => {
  expect(kindOf("Claude Fable 5 <noreply@anthropic.com>")).toBe("ai");
  expect(kindOf("GitHub Copilot <copilot@github.com>")).toBe("ai");
  expect(kindOf("Alice Example <alice@example.com>")).toBe("human");
  expect(kindOf("renovate[bot] <bot@renovateapp.com>")).toBe("bot");
  expect(kindOf("dependabot[bot] <x@github.com>")).toBe("bot");
});

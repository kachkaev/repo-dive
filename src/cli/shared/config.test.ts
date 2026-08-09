import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, it, test } from "@effect/vitest";
import { Effect } from "effect";

import {
  defaultCatalogDirName,
  defaultMaxInCharts,
  defaultWeekStartsOn,
  deriveContributorKind,
  loadConfig,
  normalizeContributorName,
  prettifyAuthorEmail,
  resolveConfig,
} from "./config.ts";

/**
 * Only the `catalog` cases care where the repository sits — the root is there
 * to anchor `catalog.dir`. A fixed fake one keeps every other assertion short.
 */
const fakeRepoRoot = path.join(os.tmpdir(), "repo-dive-fake-repo");
const resolveInRepo = (raw: unknown) => resolveConfig(raw, fakeRepoRoot);

test("resolveConfig defaults with no contributor config", () => {
  const resolved = resolveInRepo({});
  expect(resolved.maxInCharts).toBe(defaultMaxInCharts);
  const contributor = resolved.resolveContributor("carol@example.com", "Carol");
  expect(contributor.label).toBe("carol@example.com");
  expect(contributor.canonicalEmail).toBe("carol@example.com");
  expect(contributor.displayName).toBeUndefined();
  expect(contributor.url).toBeUndefined();
  expect(contributor.kind).toBe("human");
});

test("resolveConfig folds aliases into the first (canonical) entry", () => {
  const resolved = resolveInRepo({
    contributors: {
      aliases: [
        [
          "alice@work.example",
          "alice@personal.example",
          "12345+alice@users.noreply.github.com",
        ],
      ],
    },
  });
  expect(resolved.resolveContributor("alice@personal.example").label).toBe(
    "alice@work.example",
  );
  expect(
    resolved.resolveContributor("12345+alice@users.noreply.github.com").label,
  ).toBe("alice@work.example");
  // Canonical stays itself.
  expect(resolved.resolveContributor("alice@work.example").label).toBe(
    "alice@work.example",
  );
});

test("resolveConfig matches aliases case-insensitively", () => {
  const resolved = resolveInRepo({
    contributors: {
      aliases: [["Alice@Work.Example", "alice@personal.example"]],
    },
  });
  expect(resolved.resolveContributor("ALICE@personal.EXAMPLE").label).toBe(
    "Alice@Work.Example",
  );
});

test("resolveConfig still prettifies a canonical noreply address", () => {
  const resolved = resolveInRepo({});
  expect(
    resolved.resolveContributor("12345+bob@users.noreply.github.com").label,
  ).toBe("bob");
});

test("resolveConfig applies displayName, url and kind from a rich alias group", () => {
  const resolved = resolveInRepo({
    contributors: {
      aliases: [
        {
          emails: ["alice@work.example", "alice@personal.example"],
          displayName: "Alice",
          url: "https://github.com/alice",
          kind: "ai",
        },
      ],
    },
  });
  const contributor = resolved.resolveContributor("alice@personal.example");
  expect(contributor.label).toBe("Alice");
  expect(contributor.displayName).toBe("Alice");
  expect(contributor.url).toBe("https://github.com/alice");
  expect(contributor.kind).toBe("ai");
  // The email column still shows the (prettified) canonical email.
  expect(contributor.canonicalEmail).toBe("alice@work.example");
});

test("resolveConfig matches an alias by its prettified noreply handle", () => {
  // Config lists the handle a user sees in the report; the raw commit email is
  // the full GitHub noreply address.
  const resolved = resolveInRepo({
    contributors: {
      aliases: [{ emails: ["ziggy"], displayName: "Ziggy" }],
    },
  });
  const contributor = resolved.resolveContributor(
    "98765+ziggy@users.noreply.github.com",
  );
  expect(contributor.label).toBe("Ziggy");
  expect(contributor.displayName).toBe("Ziggy");
});

test("deriveContributorKind classifies bots and AI agents", () => {
  expect(deriveContributorKind("Alice <alice@example.com>")).toBe("human");
  expect(
    deriveContributorKind(
      "renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>",
    ),
  ).toBe("bot");
  expect(deriveContributorKind("dependabot[bot] <dependabot[bot]>")).toBe(
    "bot",
  );
  expect(
    deriveContributorKind(
      "Copilot <198982749+Copilot@users.noreply.github.com>",
    ),
  ).toBe("ai");
});

test("deriveContributorKind treats a trailing bot word in the name as a bot", () => {
  expect(deriveContributorKind("Release bot <release@example.com>")).toBe(
    "bot",
  );
  expect(deriveContributorKind("deploy-bot <deploy@example.com>")).toBe("bot");
  expect(deriveContributorKind("Changeset Bot <changeset@example.com>")).toBe(
    "bot",
  );
  // The word has to end the name, and be a word — not part of one, not in the email.
  expect(deriveContributorKind("Kate Talbot <kate@example.com>")).toBe("human");
  expect(deriveContributorKind("Alice <alice-bot@example.com>")).toBe("human");
  expect(deriveContributorKind("Bot Smith <bs@example.com>")).toBe("human");
});

test("normalizeContributorName drops the [bot] suffix and capitalizes", () => {
  expect(normalizeContributorName("renovate[bot]")).toBe("Renovate");
  expect(normalizeContributorName("dependabot[bot]")).toBe("Dependabot");
  expect(normalizeContributorName("github-actions[bot]")).toBe(
    "Github-actions",
  );
  expect(normalizeContributorName("Copilot[bot]")).toBe("Copilot");
});

test("normalizeContributorName leaves ordinary names untouched", () => {
  expect(normalizeContributorName("alice")).toBe("alice");
  expect(normalizeContributorName("Alice Smith")).toBe("Alice Smith");
  expect(normalizeContributorName("alice@example.com")).toBe(
    "alice@example.com",
  );
  // A degenerate "[bot]"-only name would strip to nothing — keep it verbatim.
  expect(normalizeContributorName("[bot]")).toBe("[bot]");
});

test("resolveContributor normalizes a bot's auto-derived label", () => {
  const resolved = resolveInRepo({});
  const contributor = resolved.resolveContributor(
    "29139614+renovate[bot]@users.noreply.github.com",
    "renovate[bot]",
  );
  expect(contributor.label).toBe("Renovate");
  expect(contributor.kind).toBe("bot");
});

test("resolveConfig derives kind when the config omits it", () => {
  const resolved = resolveInRepo({
    contributors: {
      aliases: [{ emails: ["Copilot"], displayName: "Copilot" }],
    },
  });
  const contributor = resolved.resolveContributor(
    "198982749+Copilot@users.noreply.github.com",
    "Copilot",
  );
  expect(contributor.kind).toBe("ai");
});

test("resolveConfig rejects malformed config", () => {
  expect(() => resolveInRepo({ contributors: "nope" })).toThrow(
    /`contributors` must be an object/,
  );
  expect(() => resolveInRepo({ contributors: { aliases: "nope" } })).toThrow(
    /`contributors.aliases` must be an array/,
  );
  expect(() => resolveInRepo({ contributors: { aliases: [[]] } })).toThrow(
    /must be a non-empty array/,
  );
  expect(() => resolveInRepo({ contributors: { aliases: [[""]] } })).toThrow(
    /must be a non-empty string/,
  );
  expect(() =>
    resolveInRepo({
      contributors: { aliases: [{ emails: ["a@x"], kind: "robot" }] },
    }),
  ).toThrow(/must be one of "human", "bot" or "ai"/);
  expect(() => resolveInRepo({ contributors: { maxInCharts: 0 } })).toThrow(
    /must be an integer between 1 and 100/,
  );
  expect(() => resolveInRepo({ contributors: { maxInCharts: 3.5 } })).toThrow(
    /must be an integer between 1 and 100/,
  );
});

test("resolveConfig defaults charts.weekStartsOn to monday", () => {
  expect(resolveInRepo({}).weekStartsOn).toBe(defaultWeekStartsOn);
  expect(resolveInRepo({ charts: {} }).weekStartsOn).toBe("monday");
});

test("resolveConfig accepts charts.weekStartsOn", () => {
  expect(
    resolveInRepo({ charts: { weekStartsOn: "sunday" } }).weekStartsOn,
  ).toBe("sunday");
  expect(
    resolveInRepo({ charts: { weekStartsOn: "monday" } }).weekStartsOn,
  ).toBe("monday");
});

test("resolveConfig rejects invalid charts config", () => {
  expect(() => resolveInRepo({ charts: [] })).toThrow(
    /`charts` must be an object/,
  );
  expect(() => resolveInRepo({ charts: { weekStartsOn: "saturday" } })).toThrow(
    /`charts.weekStartsOn` must be "monday" or "sunday"/,
  );
});

test("resolveConfig rejects an email shared across alias groups", () => {
  expect(() =>
    resolveInRepo({
      contributors: {
        aliases: [
          ["alice@work.example", "shared@example.com"],
          ["bob@work.example", "shared@example.com"],
        ],
      },
    }),
  ).toThrow(/appears in more than one alias group/);
});

test("resolveConfig puts the catalog inside the repo by default", () => {
  const resolved = resolveInRepo({});
  expect(resolved.catalogPath).toBe(
    path.join(fakeRepoRoot, defaultCatalogDirName),
  );
  expect(resolved.catalogRelativePath).toBe(defaultCatalogDirName);
  expect(resolved.checkIgnoreFiles).toBe(true);
});

test("resolveConfig resolves a relative catalog.dir against the repo root", () => {
  const resolved = resolveInRepo({ catalog: { dir: "tmp/dive-cache" } });
  expect(resolved.catalogPath).toBe(
    path.join(fakeRepoRoot, "tmp", "dive-cache"),
  );
  // Posix-shaped, because that is what ignore files speak.
  expect(resolved.catalogRelativePath).toBe("tmp/dive-cache");
});

test("resolveConfig reports a catalog outside the repo as having no relative path", () => {
  const outside = resolveInRepo({ catalog: { dir: "../shared-catalog" } });
  expect(outside.catalogRelativePath).toBeUndefined();

  const absolute = resolveInRepo({
    catalog: { dir: path.join(os.tmpdir(), "elsewhere") },
  });
  expect(absolute.catalogPath).toBe(path.join(os.tmpdir(), "elsewhere"));
  expect(absolute.catalogRelativePath).toBeUndefined();
});

test("resolveConfig accepts catalog.checkIgnoreFiles", () => {
  expect(
    resolveInRepo({ catalog: { checkIgnoreFiles: false } }).checkIgnoreFiles,
  ).toBe(false);
});

test("resolveConfig rejects invalid catalog config", () => {
  expect(() => resolveInRepo({ catalog: "nope" })).toThrow(
    /`catalog` must be an object/,
  );
  expect(() => resolveInRepo({ catalog: { dir: "  " } })).toThrow(
    /`catalog.dir` must be a non-empty string/,
  );
  // Both of these would put `gc` in charge of deleting the repository itself.
  expect(() => resolveInRepo({ catalog: { dir: "." } })).toThrow(
    /must not be the repository root/,
  );
  expect(() => resolveInRepo({ catalog: { dir: fakeRepoRoot } })).toThrow(
    /must not be the repository root/,
  );
  expect(() => resolveInRepo({ catalog: { dir: ".git/dive" } })).toThrow(
    /must not be inside `.git`/,
  );
  expect(() => resolveInRepo({ catalog: { checkIgnoreFiles: "yes" } })).toThrow(
    /`catalog.checkIgnoreFiles` must be a boolean/,
  );
});

it.effect("loadConfig returns defaults when no config file exists", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "repo-dive-cfg-"));
  return Effect.gen(function* () {
    const resolved = yield* loadConfig(dir);
    expect(resolved.maxInCharts).toBe(defaultMaxInCharts);
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        rmSync(dir, { force: true, recursive: true });
      }),
    ),
  );
});

it.effect("loadConfig imports a .mjs config file", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "repo-dive-cfg-"));
  return Effect.gen(function* () {
    writeFileSync(
      path.join(dir, "repo-dive.config.mjs"),
      'export default { contributors: { maxInCharts: 15, aliases: [["a@x.example", "a@y.example"]] } };\n',
    );
    const resolved = yield* loadConfig(dir);
    expect(resolved.maxInCharts).toBe(15);
    expect(resolved.resolveContributor("a@y.example").label).toBe(
      "a@x.example",
    );
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        rmSync(dir, { force: true, recursive: true });
      }),
    ),
  );
});

it.effect(
  "loadConfig fails with a friendly message on a malformed config",
  () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "repo-dive-cfg-"));
    return Effect.gen(function* () {
      writeFileSync(
        path.join(dir, "repo-dive.config.mjs"),
        "export default { contributors: { maxInCharts: -1 } };\n",
      );
      const error = yield* Effect.flip(loadConfig(dir));
      expect(error.message).toMatch(/Invalid repo-dive config/);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(dir, { force: true, recursive: true });
        }),
      ),
    );
  },
);

test("prettifyAuthorEmail shortens GitHub noreply addresses", () => {
  expect(prettifyAuthorEmail("12345+alice@users.noreply.github.com")).toBe(
    "alice",
  );
  expect(prettifyAuthorEmail("bob@users.noreply.github.com")).toBe("bob");
  expect(prettifyAuthorEmail("carol@example.com")).toBe("carol@example.com");
});

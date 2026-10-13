import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { Fact } from "../collectors.ts";
import { readMailmap } from "./read-mailmap.ts";

const survivalOf = (author: string): Fact => ({
  metric: "survival.lines",
  value: 3,
  categories: { extension: ".ts", author, cohort: "2026-01" },
});

const coAuthorOf = (coAuthor: string): Fact => ({
  metric: "commits.coAuthor",
  value: 1,
  categories: { coAuthor },
});

it.effect("readMailmap rewrites the identities facts name", () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-mailmap-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repoPath });
  writeFileSync(
    path.join(repoPath, ".mailmap"),
    [
      "Alice Example <alice@work.example> <alice@personal.example>",
      // Only the commits Bob signed as "bob" are his.
      "Bob Example <bob@work.example> bob <shared@example.com>",
      // Fixes the name alone.
      "Carol Proper <carol@example.com>",
      "",
    ].join("\n"),
  );

  return Effect.gen(function* () {
    // Only the address is recorded, so a new name leaves it as it is.
    const carol = survivalOf("carol@example.com");
    const facts = [
      survivalOf("alice@personal.example"),
      survivalOf("ALICE@personal.example"),
      carol,
      survivalOf("dave@example.com"),
      survivalOf(""),
      coAuthorOf("alice <alice@personal.example>"),
      coAuthorOf("bob <shared@example.com>"),
      coAuthorOf("Someone Else <shared@example.com>"),
      coAuthorOf("carol <carol@example.com>"),
      coAuthorOf("Just A Name"),
      // git would cut these short at the first `>` and hand back `odd<address`.
      survivalOf("odd<address>@example.com"),
      coAuthorOf("Odd <odd<address>@example.com>"),
      { metric: "churn.added", value: 1, categories: { extension: ".ts" } },
    ];
    const remap = yield* readMailmap(repoPath, facts);
    expect(remap).toBeDefined();
    expect(remap?.(carol)).toBe(carol);

    expect(facts.map((fact) => remap?.(fact))).toStrictEqual([
      survivalOf("alice@work.example"),
      // Emails match regardless of case, as they do for `git log`.
      survivalOf("alice@work.example"),
      survivalOf("carol@example.com"),
      survivalOf("dave@example.com"),
      survivalOf(""),
      coAuthorOf("Alice Example <alice@work.example>"),
      // A trailer keeps its name, so entries that name the old identity match.
      coAuthorOf("Bob Example <bob@work.example>"),
      coAuthorOf("Someone Else <shared@example.com>"),
      coAuthorOf("Carol Proper <carol@example.com>"),
      coAuthorOf("Just A Name"),
      survivalOf("odd<address>@example.com"),
      coAuthorOf("Odd <odd<address>@example.com>"),
      { metric: "churn.added", value: 1, categories: { extension: ".ts" } },
    ]);
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        rmSync(repoPath, { recursive: true, force: true });
      }),
    ),
    Effect.provide(NodeServices.layer),
  );
});

it.effect("readMailmap has nothing to rewrite unless an address moves", () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-mailmap-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repoPath });

  return Effect.gen(function* () {
    const facts = [survivalOf("carol@example.com")];
    expect(yield* readMailmap(repoPath, facts)).toBeUndefined();

    writeFileSync(
      path.join(repoPath, ".mailmap"),
      "Carol Proper <carol@example.com>\n",
    );
    expect(yield* readMailmap(repoPath, facts)).toBeUndefined();
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        rmSync(repoPath, { recursive: true, force: true });
      }),
    ),
    Effect.provide(NodeServices.layer),
  );
});

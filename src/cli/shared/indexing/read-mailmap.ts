import { Data, Effect } from "effect";
import type { ChildProcessSpawner } from "effect/process";

import type { Fact } from "../collectors.ts";
import { type CommandError, runGit } from "../git.ts";
import { parseIdentity } from "./parse-identity.ts";

class CheckMailmapOutputError extends Data.TaggedError(
  "CheckMailmapOutputError",
)<{
  readonly contactCount: number;
  readonly lineCount: number;
}> {
  override get message(): string {
    return `git check-mailmap answered ${this.contactCount} contacts with ${this.lineCount} lines`;
  }
}

/**
 * The line `git check-mailmap` looks an identity up by: `Name <email>`, or
 * `<email>` alone, which matches the `.mailmap` entries that don't name the
 * old identity. `undefined` for what it can't look up: no email (a bare
 * `Co-authored-by: Some Name`), an email with a `>` in it, which git cuts
 * short there, or a line break, which would split one contact in two.
 */
const contactOf = (name: string, email: string): string | undefined => {
  if (email === "" || /[>\n]/.test(email) || name.includes("\n")) {
    return undefined;
  }
  return name === "" ? `<${email}>` : `${name} <${email}>`;
};

type Lookup = {
  /** The fact category the value comes from. */
  readonly key: "author" | "coAuthor";
  readonly value: string;
  readonly contact: string;
};

/**
 * Looks up the identities `facts` name in the repository's current `.mailmap`
 * and returns a function that rewrites a fact through it, or `undefined` when
 * the `.mailmap` changes none of them.
 *
 * Collectors record authors under `author` as a bare email and co-authors
 * under `coAuthor` as the trailer's `Name <email>`, which is looked up by name
 * too, the way `git shortlog --group=trailer:co-authored-by` does. Neither is
 * mapped when collected — file survival reads the raw `%ae`, trailers are
 * kept verbatim — except line survival, which `git blame` maps through the
 * `.mailmap` of the day. Mapping them all again here, through the `.mailmap`
 * that `listCommits` reads commit authors through, brings entries added since
 * a snapshot was collected to every chart without a re-scan.
 *
 * Only additions reach back that way: line survival collected under an entry
 * keeps the address `git blame` mapped it to, so an entry removed or changed
 * since takes a re-scan to undo there. That address is looked up once more as
 * well, which only moves it if the `.mailmap` maps it in turn — a chain git
 * itself never follows.
 */
export const readMailmap = Effect.fn("readMailmap")(function* (
  repoRoot: string,
  facts: Iterable<Fact>,
): Effect.fn.Return<
  ((fact: Fact) => Fact) | undefined,
  CommandError | CheckMailmapOutputError,
  ChildProcessSpawner.ChildProcessSpawner
> {
  // Distinct values first: survival repeats one author across thousands of
  // facts.
  const authors = new Set<string>();
  const coAuthors = new Set<string>();
  for (const fact of facts) {
    const author = fact.categories?.["author"];
    const coAuthor = fact.categories?.["coAuthor"];
    if (author !== undefined) {
      authors.add(author);
    } else if (coAuthor !== undefined) {
      coAuthors.add(coAuthor);
    }
  }

  const lookups: Lookup[] = [];
  for (const value of authors) {
    const contact = contactOf("", value);
    if (contact !== undefined) {
      lookups.push({ key: "author", value, contact });
    }
  }
  for (const value of coAuthors) {
    const { name, email } = parseIdentity(value);
    const contact = contactOf(name, email);
    if (contact !== undefined) {
      lookups.push({ key: "coAuthor", value, contact });
    }
  }
  if (lookups.length === 0) {
    return undefined;
  }

  const stdout = yield* runGit(["-C", repoRoot, "check-mailmap", "--stdin"], {
    input: lookups.map(({ contact }) => `${contact}\n`).join(""),
  });
  // One line out per line in — the contact itself when nothing maps it — so
  // any other count would pair every later answer with the wrong contact.
  const answers = stdout.split("\n");
  if (answers.length !== lookups.length + 1) {
    return yield* new CheckMailmapOutputError({
      contactCount: lookups.length,
      lineCount: answers.length - 1,
    });
  }

  /** Category value → what replaces it, for the values the `.mailmap` changes. */
  const replacements = {
    author: new Map<string, string>(),
    coAuthor: new Map<string, string>(),
  };
  for (const [index, { key, value, contact }] of lookups.entries()) {
    const answer = answers[index] ?? contact;
    if (key === "coAuthor") {
      if (answer !== contact) {
        replacements.coAuthor.set(value, answer);
      }
      continue;
    }
    // An entry that only fixes the name leaves nothing to rewrite: the fact
    // records the address alone.
    const { email } = parseIdentity(answer);
    if (email !== value) {
      replacements.author.set(value, email);
    }
  }
  if (replacements.author.size === 0 && replacements.coAuthor.size === 0) {
    return undefined;
  }

  return (fact) => {
    for (const key of ["author", "coAuthor"] as const) {
      const value = fact.categories?.[key];
      const replacement =
        value === undefined ? undefined : replacements[key].get(value);
      if (replacement !== undefined) {
        return {
          ...fact,
          categories: { ...fact.categories, [key]: replacement },
        };
      }
    }
    return fact;
  };
});

import { Effect } from "effect";
import type { ChildProcessSpawner } from "effect/process";

import type { Fact } from "../collectors.ts";
import { type CommandError, runGit } from "../git.ts";
import { parseIdentity } from "./parse-identity.ts";

/**
 * The line `git check-mailmap` looks an identity up by: `Name <email>`, or
 * `<email>` alone, which matches the `.mailmap` entries that don't name the
 * old identity. `undefined` for what it can't look up: no email (a bare
 * `Co-authored-by: Some Name`), an email with brackets in it, which git cuts
 * short at the first `>`, or a line break, which would split one contact in
 * two and pair every later answer with the wrong question.
 */
const contactOf = (name: string, email: string): string | undefined => {
  if (email === "" || /[<>\n]/.test(email) || name.includes("\n")) {
    return undefined;
  }
  return name === "" ? `<${email}>` : `${name} <${email}>`;
};

/**
 * The identity a fact names, as a contact. Collectors record authors under
 * `author` as a bare email — `git blame`, `git log --format=%ae` — and
 * co-authors under `coAuthor` as the trailer's `Name <email>`, which git maps
 * by name too, the way `git shortlog --group=trailer:co-authored-by` does.
 */
const contactIn = (fact: Fact): string | undefined => {
  const author = fact.categories?.["author"];
  if (author !== undefined) {
    return contactOf("", author);
  }
  const coAuthor = fact.categories?.["coAuthor"];
  if (coAuthor !== undefined) {
    const { name, email } = parseIdentity(coAuthor);
    return contactOf(name, email);
  }
  return undefined;
};

/**
 * Looks up the identities `facts` name in the repository's current `.mailmap`
 * and returns a function that rewrites a fact through it.
 *
 * Facts keep the identity git reported when they were collected: file
 * survival reads the raw `%ae`, trailers are kept verbatim, and line survival
 * goes through whichever `.mailmap` the repository had at scan time. Mapping
 * them all again at index time, with the one `.mailmap` that `listCommits`
 * reads authors through, keeps every chart naming one person the same way
 * without a re-scan — including after a later edit to `.mailmap`. A fact
 * already mapped at scan time comes back unchanged.
 */
export const readMailmap = Effect.fn("readMailmap")(function* (
  repoRoot: string,
  facts: Iterable<Fact>,
): Effect.fn.Return<
  (fact: Fact) => Fact,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> {
  const contacts = new Set<string>();
  for (const fact of facts) {
    const contact = contactIn(fact);
    if (contact !== undefined) {
      contacts.add(contact);
    }
  }
  if (contacts.size === 0) {
    return (fact) => fact;
  }

  // One line out per line in: the contact itself when nothing maps it.
  const contactList = [...contacts];
  const stdout = yield* runGit(["-C", repoRoot, "check-mailmap", "--stdin"], {
    input: contactList.map((contact) => `${contact}\n`).join(""),
  });
  const mappedContacts = stdout.split("\n");
  /** Contact → what `.mailmap` turns it into, for the contacts it changes. */
  const mapped = new Map<string, string>();
  for (const [index, contact] of contactList.entries()) {
    const mappedContact = mappedContacts[index];
    if (mappedContact !== undefined && mappedContact !== contact) {
      mapped.set(contact, mappedContact);
    }
  }
  if (mapped.size === 0) {
    return (fact) => fact;
  }

  return (fact) => {
    const contact = contactIn(fact);
    const mappedContact =
      contact === undefined ? undefined : mapped.get(contact);
    if (mappedContact === undefined) {
      return fact;
    }
    const categories = { ...fact.categories };
    if (categories["author"] === undefined) {
      categories["coAuthor"] = mappedContact;
    } else {
      categories["author"] = parseIdentity(mappedContact).email;
    }
    return { ...fact, categories };
  };
});

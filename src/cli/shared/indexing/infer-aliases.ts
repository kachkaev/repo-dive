import { prettifyAuthorEmail, type ResolvedConfig } from "../config.ts";

type ResolveContributor = ResolvedConfig["resolveContributor"];

/** A commit author as git reports it (after `.mailmap`). */
type AuthorIdentity = { readonly name: string; readonly email: string };

/**
 * `12345+alice@users.noreply.github.com` → `12345`: the GitHub account behind
 * the address, which outlives a renamed handle. Old-style noreply addresses
 * carry no ID.
 */
const githubAccountIdOf = (email: string): string | undefined =>
  /^(\d+)\+[^@]+@users\.noreply\.github\.com$/i.exec(email)?.[1];

/** What alias groups and buckets key off: `alice@x.com`, or `alice` for a noreply address. */
const keyOf = (email: string): string =>
  prettifyAuthorEmail(email).toLowerCase();

type IdentityNode = {
  /** The raw address this identity commits under most — what gets resolved. */
  email: string;
  commits: number;
  commitsByEmail: Map<string, number>;
  names: Set<string>;
  /** Every observed spelling resolved to a human — bots and agents stay apart. */
  human: boolean;
  /** Canonical email of the config alias group that lists it, if any. */
  group: string | undefined;
  /** A GitHub noreply address, whose key is the account's handle. */
  noreply: boolean;
};

/**
 * Extends `resolveContributor` with the alias groups a history spells out on
 * its own, so one person's addresses become one contributor without anyone
 * listing them. Only links that cannot pair up two different people count:
 *
 * - two GitHub noreply addresses of one account — `12345+alice@…` and
 *   `12345+alice-old@…`, from after and before a rename;
 * - a single-word name that is a noreply handle seen in the same history —
 *   `alice <alice@example.com>` is `alice@users.noreply.github.com`.
 *   Handles are unique on GitHub, and people don't sign commits with someone
 *   else's: none of the 41 such links across the example repositories did.
 *
 * Matching full names is deliberately not among them: `David Hu` and `Jason
 * Miller` each turned out to be two people within one repository.
 *
 * Folding is transitive and reaches the config's alias groups: an address no
 * group lists joins the one group it is linked to. Groups themselves stay as
 * configured — never merged with each other, and never joined by an address
 * linked to more than one. Each folded identity resolves through the address
 * its person committed under most (or through the group), so the email column
 * and the bucket key stay a real address.
 */
export const inferAliases = (
  resolveContributor: ResolveContributor,
  authors: Iterable<AuthorIdentity>,
): ResolveContributor => {
  const nodes = new Map<string, IdentityNode>();
  for (const { name, email } of authors) {
    const key = keyOf(email);
    const resolved = resolveContributor(email, name);
    const node: IdentityNode = nodes.get(key) ?? {
      email,
      commits: 0,
      commitsByEmail: new Map(),
      names: new Set(),
      human: true,
      group: undefined,
      noreply: prettifyAuthorEmail(email) !== email,
    };
    node.commits += 1;
    const emailCommits = (node.commitsByEmail.get(email) ?? 0) + 1;
    node.commitsByEmail.set(email, emailCommits);
    if (emailCommits > (node.commitsByEmail.get(node.email) ?? 0)) {
      node.email = email;
    }
    if (name) {
      node.names.add(name);
    }
    node.human &&= resolved.kind === "human";
    if (resolved.aliased) {
      node.group = resolved.canonicalEmail.toLowerCase();
    }
    nodes.set(key, node);
  }
  const humans = new Map(nodes.entries().filter(([, node]) => node.human));

  // Every signal names the identities it links: one GitHub account, or one
  // noreply handle together with the single-word names that spell it.
  const membersBySignal = new Map<string, Set<string>>();
  const addMember = (signal: string, key: string): void => {
    const members = membersBySignal.get(signal) ?? new Set();
    members.add(key);
    membersBySignal.set(signal, members);
  };
  for (const [key, node] of humans) {
    for (const email of node.commitsByEmail.keys()) {
      const accountId = githubAccountIdOf(email);
      if (accountId !== undefined) {
        addMember(`account:${accountId}`, key);
      }
    }
    for (const name of node.names) {
      const word = name.trim().toLowerCase();
      if (humans.get(word)?.noreply === true) {
        addMember(`handle:${word}`, word);
        addMember(`handle:${word}`, key);
      }
    }
  }

  // People no group lists fold among themselves first…
  const parent = new Map<string, string>();
  const rootOf = (key: string): string => {
    const next = parent.get(key);
    if (next === undefined) {
      return key;
    }
    const root = rootOf(next);
    parent.set(key, root);
    return root;
  };
  for (const members of membersBySignal.values()) {
    const unlisted = [...members].filter(
      (key) => humans.get(key)?.group === undefined,
    );
    const [first] = unlisted;
    if (first === undefined) {
      continue;
    }
    for (const key of unlisted) {
      const left = rootOf(first);
      const right = rootOf(key);
      if (left !== right) {
        parent.set(left, right);
      }
    }
  }

  // …then each such person joins the alias group they are linked to, unless
  // they are linked to several.
  const groupsByRoot = new Map<string, Set<string>>();
  for (const members of membersBySignal.values()) {
    const groups = new Set(
      [...members]
        .map((key) => humans.get(key)?.group)
        .filter((group) => group !== undefined),
    );
    if (groups.size === 0) {
      continue;
    }
    for (const key of members) {
      if (humans.get(key)?.group !== undefined) {
        continue;
      }
      const root = rootOf(key);
      groupsByRoot.set(
        root,
        new Set([...(groupsByRoot.get(root) ?? []), ...groups]),
      );
    }
  }
  /** A raw email each group resolves through — any member's will do. */
  const emailByGroup = new Map<string, string>();
  /** Root → its busiest member, whose address the others resolve through. */
  const busiestByRoot = new Map<string, IdentityNode>();
  for (const [key, node] of humans) {
    if (node.group !== undefined) {
      emailByGroup.set(node.group, node.email);
      continue;
    }
    const root = rootOf(key);
    const busiest = busiestByRoot.get(root);
    if (busiest === undefined || node.commits > busiest.commits) {
      busiestByRoot.set(root, node);
    }
  }

  /** Identity key → raw email to resolve instead, for folded identities only. */
  const anchorEmailByKey = new Map<string, string>();
  for (const [key, node] of humans) {
    if (node.group !== undefined) {
      continue;
    }
    const root = rootOf(key);
    const [onlyGroup, ...otherGroups] = groupsByRoot.get(root) ?? [];
    const anchorEmail =
      onlyGroup !== undefined && otherGroups.length === 0
        ? emailByGroup.get(onlyGroup)
        : busiestByRoot.get(root)?.email;
    if (anchorEmail !== undefined && anchorEmail !== node.email) {
      anchorEmailByKey.set(key, anchorEmail);
    }
  }

  return (email, name) =>
    resolveContributor(anchorEmailByKey.get(keyOf(email)) ?? email, name);
};

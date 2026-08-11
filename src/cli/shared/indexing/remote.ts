import { Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { type CommandError, runGit } from "../git.ts";

/**
 * Turns whatever `remote.origin.url` holds into a URL a browser can open, or
 * `undefined` when there is nothing to link to (no remote, a local path, an
 * unparseable value).
 *
 * The result is deliberately minimal — scheme, host and path — because it ends
 * up in a shareable report: any credentials git keeps in the remote (CI often
 * writes `https://x-access-token:…@github.com/…`) must not travel with it.
 */
export const parseRemoteUrl = (raw: string): string | undefined => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }

  // `git@host:org/repo.git` is scp-like, not a URL — rewrite it into one. The
  // colon must be followed by a path segment rather than a port, otherwise
  // `host:22/x` (a genuine URL missing its scheme) would lose its port.
  const scpMatch = trimmed.includes("://")
    ? undefined
    : /^(?:[^@/]+@)?(?<host>[^/:]+):(?<path>(?!\/).+)$/.exec(trimmed)?.groups;
  const candidate = scpMatch
    ? `ssh://${scpMatch["host"]}/${scpMatch["path"]}`
    : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return undefined;
  }

  // A remote can be a bare path or a `file://` URL — nothing to open.
  if (parsed.protocol === "file:" || parsed.hostname === "") {
    return undefined;
  }

  const segments = parsed.pathname
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => decodeURIComponent(segment));
  const lastSegment = segments.at(-1)?.replace(/\.git$/, "");
  if (lastSegment === undefined || lastSegment === "") {
    return undefined;
  }
  segments[segments.length - 1] = lastSegment;

  // An ssh/git port (`ssh://git@host:2222/…`) says nothing about where the web
  // UI listens, so it is dropped; an http(s) one is kept as given.
  const overTheWeb =
    parsed.protocol === "http:" || parsed.protocol === "https:";
  const scheme = parsed.protocol === "http:" ? "http" : "https";
  const host = overTheWeb ? parsed.host : parsed.hostname;

  return `${scheme}://${host}/${segments.join("/")}`;
};

/**
 * The browsable URL of the repository's `origin`, if it has one. A repo with no
 * origin is perfectly normal, and so is a git that refuses to answer, so this
 * never fails the run it decorates.
 */
export const readRemoteUrl = (
  repoRoot: string,
): Effect.Effect<
  string | undefined,
  CommandError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  runGit(["-C", repoRoot, "config", "--get", "remote.origin.url"], {
    // 1 = the key is not set.
    okExitCodes: [1],
  }).pipe(
    Effect.map(parseRemoteUrl),
    Effect.catchTag("GitCommandError", () => Effect.succeed(undefined)),
  );

import { expect, test } from "vitest";

import { parseRemoteUrl } from "./remote.ts";

test("parseRemoteUrl normalizes the shapes git writes into remote.origin.url", () => {
  expect(parseRemoteUrl("https://github.com/kachkaev/repo-dive.git")).toBe(
    "https://github.com/kachkaev/repo-dive",
  );
  expect(parseRemoteUrl("  git@github.com:kachkaev/repo-dive.git\n")).toBe(
    "https://github.com/kachkaev/repo-dive",
  );
  expect(parseRemoteUrl("ssh://git@github.com/kachkaev/repo-dive.git")).toBe(
    "https://github.com/kachkaev/repo-dive",
  );
  expect(parseRemoteUrl("git://github.com/kachkaev/repo-dive.git")).toBe(
    "https://github.com/kachkaev/repo-dive",
  );
  // Nested groups are ordinary path segments — GitLab relies on them.
  expect(parseRemoteUrl("git@gitlab.com:group/sub/repo.git")).toBe(
    "https://gitlab.com/group/sub/repo",
  );
  expect(parseRemoteUrl("https://gitlab.example.com/group/repo/")).toBe(
    "https://gitlab.example.com/group/repo",
  );
});

test("parseRemoteUrl drops credentials and ssh ports", () => {
  expect(
    parseRemoteUrl("https://x-access-token:secret@github.com/org/repo.git"),
  ).toBe("https://github.com/org/repo");
  // The ssh port says nothing about where the web UI listens.
  expect(parseRemoteUrl("ssh://git@git.example.com:2222/org/repo.git")).toBe(
    "https://git.example.com/org/repo",
  );
  // An http(s) port, on the other hand, is the web UI's own.
  expect(parseRemoteUrl("https://git.example.com:8443/org/repo.git")).toBe(
    "https://git.example.com:8443/org/repo",
  );
  expect(parseRemoteUrl("https://git.example.com/org/repo.git")).toBe(
    "https://git.example.com/org/repo",
  );
});

test("parseRemoteUrl gives up on remotes with nothing to open", () => {
  expect(parseRemoteUrl("")).toBeUndefined();
  expect(parseRemoteUrl(" ".repeat(3))).toBeUndefined();
  expect(parseRemoteUrl("../sibling-repo.git")).toBeUndefined();
  expect(parseRemoteUrl("/srv/git/repo.git")).toBeUndefined();
  expect(parseRemoteUrl("file:///srv/git/repo.git")).toBeUndefined();
  expect(parseRemoteUrl("https://github.com/")).toBeUndefined();
});

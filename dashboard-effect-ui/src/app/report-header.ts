import type { View } from "@effect/ui";
import type { Html } from "@effect/ui/html";

import type { DashboardData } from "../data.ts";
import { Tooltip } from "./shared/@ui-primitive/tooltip.ts";
import { formatDate } from "./shared/format.ts";

const repoDiveUrl = "https://github.com/kachkaev/repo-dive";

/** Forges whose web UI the dashboard knows how to link into. */
type RemoteHostKind = "github" | "gitlab" | "unknown";

type Remote = {
  /** The repository's own page. */
  url: string;
  host: string;
  hostKind: RemoteHostKind;
  /** Path segments of the repo: `["org", "repo"]`, or deeper on GitLab. */
  segments: string[];
};

/**
 * Splits `repo.remoteUrl` into what the heading renders. Self-hosted forges
 * are recognized by the customary `github.acme.com` / `gitlab.acme.com` naming
 * — a wrong guess only picks the wrong logo, never a wrong link.
 */
const parseRemote = (url: string): Remote | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const segments = parsed.pathname
    .split("/")
    .filter((segment) => segment !== "");
  if (segments.length === 0) {
    return undefined;
  }
  const host = parsed.host;
  const hostKind: RemoteHostKind =
    host === "github.com" || host.startsWith("github.")
      ? "github"
      : host === "gitlab.com" || host.startsWith("gitlab.")
        ? "gitlab"
        : "unknown";
  return { url, host, hostKind, segments };
};

/** Where a commit lives on the forge, when its URL shape is known. */
const commitUrlOf = (remote: Remote, sha: string): string | undefined => {
  switch (remote.hostKind) {
    case "github": {
      return `${remote.url}/commit/${sha}`;
    }
    case "gitlab": {
      return `${remote.url}/-/commit/${sha}`;
    }
    case "unknown": {
      return undefined;
    }
  }
};

const ForgeMark = <M>(h: Html.H<M>, path: string) =>
  h.svg
    .attrs({ viewBox: "0 0 24 24", "aria-hidden": "true" })
    .class("size-5 shrink-0")
    .children(h.path.attrs({ fill: "currentColor", d: path }));

/** The GitHub mark (simple-icons, CC0). */
const gitHubMarkPath =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

/** The GitLab tanuki (simple-icons, CC0). */
const gitLabMarkPath =
  "m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z";

/**
 * The repository, as a breadcrumb: `org / repo` under its forge's logo, or the
 * host followed by the path when the forge is unknown. Without a remote there
 * is nothing to link to, so the checkout's own name stands alone.
 */
const RepoHeading = <M>(
  h: Html.H<M>,
  name: string,
  remote: Remote | undefined,
) => {
  if (!remote) {
    return h.h1.class("text-2xl font-semibold").children(name);
  }

  // An unknown host is part of the repo's identity — "example.com / org / repo"
  // — while a known forge is already spelled out by its logo.
  const sections =
    remote.hostKind === "unknown"
      ? [remote.host, ...remote.segments]
      : remote.segments;

  // `group-hover` pulls the dimmed segments (group, host, separators) up to
  // the link color along with the rest, so a hover reads as "the whole
  // breadcrumb is one link" rather than highlighting only the repo name.
  return h.h1.class("text-2xl font-semibold").children(
    h.a
      .attrs({ href: remote.url, target: "_blank", rel: "noreferrer" })
      .class(
        "group inline-flex cursor-pointer items-center gap-2 hover:text-(--series-1)",
      )
      .children(
        remote.hostKind === "github"
          ? ForgeMark(h, gitHubMarkPath)
          : remote.hostKind === "gitlab"
            ? ForgeMark(h, gitLabMarkPath)
            : undefined,
        h.span(
          sections.flatMap((section, index) => [
            index > 0
              ? h.span
                  .class(
                    "mx-1.5 font-normal text-(--text-muted) group-hover:text-(--series-1)",
                  )
                  .children("/")
              : undefined,
            h.span
              .class(
                index === sections.length - 1
                  ? undefined
                  : "font-normal text-(--text-secondary) group-hover:text-(--series-1)",
              )
              .children(section),
          ]),
        ),
      ),
  );
};

/** The dotted underline that marks "this tooltip trigger is also a link". */
const tooltipUnderline =
  "underline decoration-dotted decoration-(--text-muted) underline-offset-4";

/**
 * A date whose exact meaning lives in a tooltip, optionally linking out. When
 * there is nowhere to link, the trigger is a plain focusable button (so the
 * tooltip still opens from the keyboard) with a `help` cursor and no underline
 * — both a pointer and an underline would promise a click that does nothing.
 *
 * `whitespace-nowrap` keeps `YYYY-MM-DD` whole: its hyphens are break
 * opportunities, and a date split across two lines stops reading as a date.
 */
const AnnotatedDate = <M>(
  h: Html.H<M>,
  options: {
    readonly key: string;
    readonly isoDate: string;
    readonly tooltip: View.Children<M, never>;
    readonly href?: string | undefined;
  },
) =>
  Tooltip(h, {
    key: options.key,
    props:
      options.href === undefined
        ? { delay: 200, triggerClass: "cursor-help whitespace-nowrap" }
        : {
            delay: 200,
            href: options.href,
            triggerClass: `${tooltipUnderline} cursor-pointer whitespace-nowrap hover:text-(--series-1)`,
          },
    slots: {
      trigger: formatDate(options.isoDate),
      content: options.tooltip,
    },
  });

/**
 * Date and time of `isoTimestamp` in the reader's own locale and zone. The
 * `full` date style is what names the weekday — the trigger shows a bare
 * `YYYY-MM-DD`, so the tooltip is where "which day of the week was that?" gets
 * answered, as it is in every chart's tooltip.
 */
const formatTimestamp = (isoTimestamp: string): string => {
  const parsed = new Date(isoTimestamp);
  return Number.isNaN(parsed.getTime())
    ? isoTimestamp
    : parsed.toLocaleString(undefined, {
        dateStyle: "full",
        timeStyle: "long",
      });
};

const CommitDate = <M>(
  h: Html.H<M>,
  options: {
    readonly key: string;
    readonly isoDate: string;
    readonly sha: string | undefined;
    readonly remote: Remote | undefined;
  },
) =>
  AnnotatedDate(h, {
    key: options.key,
    isoDate: options.isoDate,
    href:
      options.remote && options.sha
        ? commitUrlOf(options.remote, options.sha)
        : undefined,
    tooltip: options.sha
      ? [formatTimestamp(options.isoDate), h.br, `Commit hash: ${options.sha}`]
      : [formatTimestamp(options.isoDate)],
  });

/**
 * Title and provenance: what was analyzed, by what, when, and over which slice
 * of the repository's history. A view function: the four tooltips are child
 * components that keep their own open state.
 */
export const ReportHeader = <M>(
  h: Html.H<M>,
  repo: DashboardData["repo"],
  generatedAt: string,
) => {
  const remote = repo.remoteUrl ? parseRemote(repo.remoteUrl) : undefined;

  return h.header.class("mb-8").children(
    RepoHeading(h, repo.name, remote),
    // `tabular-nums` for the dates: the coverage pair sits side by side, and
    // two dates of the same shape should measure the same. The tooltips sit
    // in the top layer and keep the prose figures their sentences want.
    h.p.class("mt-1.5 text-sm tabular-nums text-(--text-secondary)").children(
      "Analyzed by ",
      Tooltip(h, {
        key: "repo-dive",
        props: {
          delay: 200,
          href: repoDiveUrl,
          triggerClass: `${tooltipUnderline} cursor-pointer hover:text-(--series-1)`,
        },
        slots: {
          trigger: "repo-dive",
          content:
            "The open-source tool that generated this report — opens kachkaev/repo-dive on GitHub",
        },
      }),
      " on ",
      AnnotatedDate(h, {
        key: "generated-at",
        isoDate: generatedAt,
        tooltip: [formatTimestamp(generatedAt)],
      }),
      repo.firstCommitDate
        ? [
            // A narrow screen wraps this line, and the only tolerable place
            // to break it is between the two clauses: the separator is glued
            // to the generation date by a non-breaking space, and the coverage
            // clause travels as one `inline-block` so "coverage:" never ends
            // up stranded on the line above its dates.
            " · ",
            h.span.class("inline-block").children(
              "coverage: ",
              CommitDate(h, {
                key: "first-commit",
                isoDate: repo.firstCommitDate,
                sha: repo.firstCommitSha,
                remote,
              }),
              " — ",
              CommitDate(h, {
                key: "last-commit",
                isoDate: repo.lastCommitDate ?? repo.firstCommitDate,
                sha: repo.lastCommitSha,
                remote,
              }),
            ),
          ]
        : " · no history",
    ),
  );
};

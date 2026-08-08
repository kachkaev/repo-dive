import { Fragment, type ReactNode } from "react";

import type { DashboardData } from "../data.ts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./shared/@ui-primitive/tooltip.tsx";
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

/** The GitHub mark (simple-icons, CC0). */
function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
      <path
        fill="currentColor"
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      />
    </svg>
  );
}

/** The GitLab tanuki (simple-icons, CC0). */
function GitLabMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
      <path
        fill="currentColor"
        d="m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z"
      />
    </svg>
  );
}

/**
 * The repository, as a breadcrumb: `org / repo` under its forge's logo, or the
 * host followed by the path when the forge is unknown. Without a remote there
 * is nothing to link to, so the checkout's own name stands alone.
 */
function RepoHeading({
  name,
  remote,
}: {
  name: string;
  remote: Remote | undefined;
}) {
  if (!remote) {
    return <h1 className="text-2xl font-semibold">{name}</h1>;
  }

  // An unknown host is part of the repo's identity — "example.com / org / repo"
  // — while a known forge is already spelled out by its logo.
  const sections =
    remote.hostKind === "unknown"
      ? [remote.host, ...remote.segments]
      : remote.segments;

  return (
    <h1 className="text-2xl font-semibold">
      {/*
        `group-hover` pulls the dimmed segments (group, host, separators) up to
        the link color along with the rest, so a hover reads as "the whole
        breadcrumb is one link" rather than highlighting only the repo name.
      */}
      <a
        href={remote.url}
        target="_blank"
        rel="noreferrer"
        className="group inline-flex cursor-pointer items-center gap-2 hover:text-(--series-1)"
      >
        {remote.hostKind === "github" ? (
          <GitHubMark />
        ) : remote.hostKind === "gitlab" ? (
          <GitLabMark />
        ) : undefined}
        <span>
          {sections.map((section, index) => (
            <Fragment key={index}>
              {index > 0 ? (
                <span className="mx-1.5 font-normal text-(--text-muted) group-hover:text-(--series-1)">
                  /
                </span>
              ) : undefined}
              <span
                className={
                  index === sections.length - 1
                    ? undefined
                    : "font-normal text-(--text-secondary) group-hover:text-(--series-1)"
                }
              >
                {section}
              </span>
            </Fragment>
          ))}
        </span>
      </a>
    </h1>
  );
}

/** The dotted underline that marks "hover or focus me for a tooltip". */
const tooltipUnderline =
  "underline decoration-dotted decoration-(--text-muted) underline-offset-4";

/**
 * A date whose exact meaning lives in a tooltip, optionally linking out. When
 * there is nowhere to link, the trigger is a focusable span (so the tooltip
 * still opens from the keyboard) with a `help` cursor — a pointer would
 * promise a click that does nothing.
 */
function AnnotatedDate({
  isoDate,
  tooltip,
  href,
}: {
  isoDate: string;
  tooltip: ReactNode;
  href?: string | undefined;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          href === undefined ? (
            <span tabIndex={0} className={`${tooltipUnderline} cursor-help`} />
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={`${tooltipUnderline} cursor-pointer hover:text-(--series-1)`}
            />
          )
        }
      >
        {formatDate(isoDate)}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Date and time of `isoTimestamp` in the reader's own locale and zone. */
const formatTimestamp = (isoTimestamp: string): string => {
  const parsed = new Date(isoTimestamp);
  return Number.isNaN(parsed.getTime())
    ? isoTimestamp
    : parsed.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "long",
      });
};

function CommitDate({
  isoDate,
  sha,
  remote,
}: {
  isoDate: string;
  sha: string | undefined;
  remote: Remote | undefined;
}) {
  const commitUrl = remote && sha ? commitUrlOf(remote, sha) : undefined;
  return (
    <AnnotatedDate
      isoDate={isoDate}
      href={commitUrl}
      tooltip={
        <>
          {formatTimestamp(isoDate)}
          {sha ? (
            <>
              <br />
              Commit hash: {sha}
            </>
          ) : undefined}
        </>
      }
    />
  );
}

/**
 * Title and provenance: what was analyzed, by what, when, and over which slice
 * of the repository's history.
 */
export function ReportHeader({
  repo,
  generatedAt,
}: {
  repo: DashboardData["repo"];
  generatedAt: string;
}) {
  const remote = repo.remoteUrl ? parseRemote(repo.remoteUrl) : undefined;

  return (
    <header className="mb-8">
      <RepoHeading name={repo.name} remote={remote} />
      <p className="mt-1.5 text-sm text-(--text-secondary)">
        Analyzed by{" "}
        <Tooltip>
          <TooltipTrigger
            delay={200}
            render={
              <a
                href={repoDiveUrl}
                target="_blank"
                rel="noreferrer"
                className={`${tooltipUnderline} cursor-pointer hover:text-(--series-1)`}
              />
            }
          >
            repo-dive
          </TooltipTrigger>
          <TooltipContent>
            The open-source tool that generated this report — opens
            kachkaev/repo-dive on GitHub
          </TooltipContent>
        </Tooltip>{" "}
        at{" "}
        <AnnotatedDate
          isoDate={generatedAt}
          tooltip={formatTimestamp(generatedAt)}
        />
        {repo.firstCommitDate ? (
          <>
            {" · coverage: "}
            <CommitDate
              isoDate={repo.firstCommitDate}
              sha={repo.firstCommitSha}
              remote={remote}
            />
            {" — "}
            <CommitDate
              isoDate={repo.lastCommitDate ?? repo.firstCommitDate}
              sha={repo.lastCommitSha}
              remote={remote}
            />
          </>
        ) : (
          " · no history"
        )}
      </p>
    </header>
  );
}

import type { ReactNode } from "react";

/**
 * The inline marks chart annotations may use, tried in this order at each
 * position: `` `code` ``, `**bold**`, `*italic*`/`_italic_` and
 * `[text](url)`. Link text stays plain — nesting is out of scope for a
 * renderer this small.
 */
const inlinePattern =
  /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^\s)]+)\)/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(inlinePattern)) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const [, code, bold, star, underscore, linkText, linkUrl] = match;
    const key = `${match.index}-${nodes.length}`;
    if (code !== undefined) {
      nodes.push(
        <code
          key={key}
          className="rounded-xs bg-(--surface-2) px-1 font-mono text-[0.85em]"
        >
          {code}
        </code>,
      );
    } else if (bold !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {bold}
        </strong>,
      );
    } else if (star !== undefined || underscore !== undefined) {
      nodes.push(<em key={key}>{star ?? underscore}</em>);
    } else if (linkText !== undefined && linkUrl !== undefined) {
      nodes.push(
        <a
          key={key}
          href={linkUrl}
          target="_blank"
          rel="noreferrer"
          className="cursor-pointer underline underline-offset-2 hover:text-(--series-1)"
        >
          {linkText}
        </a>,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

/**
 * Renders the small Markdown subset chart annotations are written in:
 * blank-line-separated paragraphs, `- ` lists and the inline marks of
 * {@link inlinePattern}. Everything becomes React elements — no HTML
 * injection, so config-provided text is safe to render verbatim.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = source
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").map((line) => line.trim());
        const isList = lines.every((line) => line.startsWith("- "));
        return isList ? (
          <ul key={blockIndex} className="mt-1 list-disc pl-4 first:mt-0">
            {lines.map((line, lineIndex) => (
              <li key={lineIndex}>{renderInline(line.slice(2))}</li>
            ))}
          </ul>
        ) : (
          <p key={blockIndex} className="mt-1 first:mt-0">
            {renderInline(lines.join(" "))}
          </p>
        );
      })}
    </>
  );
}

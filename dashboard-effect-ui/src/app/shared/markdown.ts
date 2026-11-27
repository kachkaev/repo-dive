import type { Html } from "@effect/ui/html";

/**
 * The inline marks chart annotations may use, tried in this order at each
 * position: `` `code` ``, `**bold**`, `*italic*`/`_italic_` and
 * `[text](url)`. Link text stays plain — nesting is out of scope for a
 * renderer this small.
 */
const inlinePattern =
  /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^\s)]+)\)/g;

const renderInline = <M>(h: Html.H<M>, text: string) => {
  const nodes = [];
  let cursor = 0;
  for (const match of text.matchAll(inlinePattern)) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const [, code, bold, star, underscore, linkText, linkUrl] = match;
    if (code !== undefined) {
      nodes.push(
        h.code
          .class("rounded-xs bg-(--surface-2) px-1 font-mono text-[0.85em]")
          .children(code),
      );
    } else if (bold !== undefined) {
      nodes.push(h.strong.class("font-semibold").children(bold));
    } else if (star !== undefined || underscore !== undefined) {
      nodes.push(h.em(star ?? underscore ?? ""));
    } else if (linkText !== undefined && linkUrl !== undefined) {
      nodes.push(
        h.a
          .attrs({ href: linkUrl, target: "_blank", rel: "noreferrer" })
          .class(
            "cursor-pointer underline underline-offset-2 hover:text-(--series-1)",
          )
          .children(linkText),
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
};

/**
 * Renders the small Markdown subset chart annotations are written in:
 * blank-line-separated paragraphs, `- ` lists and the inline marks of
 * {@link inlinePattern}. Everything becomes view nodes — no HTML injection, so
 * config-provided text is safe to render verbatim.
 *
 * `@effect/ui/html` ships a Markdown module of its own, but it compiles
 * CommonMark at build time (a Vite plugin) or parses all of it at runtime;
 * this keeps the React dashboard's subset, so both render a note alike.
 */
export const Markdown = <M>(h: Html.H<M>, source: string) =>
  source
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim());
      const isList = lines.every((line) => line.startsWith("- "));
      return isList
        ? h.ul
            .class("mt-1 list-disc pl-4 first:mt-0")
            .children(lines.map((line) => h.li(renderInline(h, line.slice(2)))))
        : h.p
            .class("mt-1 first:mt-0")
            .children(renderInline(h, lines.join(" ")));
    });

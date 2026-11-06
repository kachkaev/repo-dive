/** What `extensionOf` calls the extension of a file that has none. */
export const noExtension = "(none)";

/**
 * The language repo-dive attributes each source extension to. One map serves
 * every language-shaped view: the `languages` collector labels its per-file
 * line counts with it, `indexing` relabels the survival and file-count
 * breakdowns with it, and its key set is what the built-in file purpose rules
 * treat as source (see `file-purposes.ts`).
 *
 * Classifying by extension is an approximation — a real classifier reads the
 * file — but it is the same approximation everywhere, so every view of a repo
 * describes one file universe rather than each picking its own.
 */
const languageByExtension: Record<string, string> = {
  ".astro": "Astro",
  ".c": "C",
  ".cc": "C++",
  ".cjs": "JavaScript",
  ".cmake": "CMake",
  ".cpp": "C++",
  ".cs": "C#",
  ".css": "CSS",
  ".cts": "TypeScript",
  ".cxx": "C++",
  ".go": "Go",
  ".graphql": "GraphQL",
  ".h": "C Header",
  ".hh": "C++ Header",
  ".hpp": "C++ Header",
  ".html": "HTML",
  ".java": "Java",
  ".js": "JavaScript",
  ".jsx": "JSX",
  ".kt": "Kotlin",
  ".less": "LESS",
  ".lua": "Lua",
  ".m": "Objective-C",
  ".md": "Markdown",
  ".mdc": "Markdown",
  ".mdx": "Markdown",
  ".mjs": "JavaScript",
  ".mm": "Objective-C",
  ".mts": "TypeScript",
  ".php": "PHP",
  ".pl": "Perl",
  ".pm": "Perl",
  ".prisma": "Prisma",
  ".proto": "Protocol Buffers",
  ".ps1": "PowerShell",
  ".py": "Python",
  ".rb": "Ruby",
  ".rs": "Rust",
  ".sass": "Sass",
  ".scss": "Sass",
  ".sh": "Shell",
  ".sql": "SQL",
  ".svelte": "Svelte",
  ".swift": "Swift",
  ".ts": "TypeScript",
  ".tsx": "TSX",
  ".vue": "Vue",
  ".yaml": "YAML",
  ".yml": "YAML",
};

/**
 * Extensions considered source-like. Binaries, lockfiles and data formats are
 * deliberately absent: a chart that counts them is a chart about generated
 * bytes, and no per-line history can be told about them anyway.
 */
export const sourceExtensions: ReadonlySet<string> = new Set(
  Object.keys(languageByExtension),
);

/** Unknown extensions show up as themselves rather than disappearing. */
export const languageOfExtension = (extension: string): string =>
  extension === noExtension
    ? "No extension"
    : (languageByExtension[extension] ?? extension);

/**
 * The language repo-dive attributes each source extension to. One map serves
 * every language-shaped view: the `languages` collector labels its per-file
 * line counts with it, `indexing` relabels the blame-based survival breakdown
 * with it, and its key set is what content-level collectors treat as source
 * (see `isScannableSourceFile`).
 *
 * Classifying by extension is an approximation — a real classifier reads the
 * file — but it is the same approximation everywhere, so every view of a repo
 * describes one file universe rather than each picking its own.
 */
const languageByExtension: Record<string, string> = {
  ".astro": "Astro",
  ".c": "C",
  ".cjs": "JavaScript",
  ".cpp": "C++",
  ".cs": "C#",
  ".css": "CSS",
  ".cts": "TypeScript",
  ".go": "Go",
  ".h": "C Header",
  ".hpp": "C++ Header",
  ".html": "HTML",
  ".java": "Java",
  ".js": "JavaScript",
  ".jsx": "JSX",
  ".kt": "Kotlin",
  ".less": "LESS",
  ".md": "Markdown",
  ".mdx": "Markdown",
  ".mjs": "JavaScript",
  ".mts": "TypeScript",
  ".php": "PHP",
  ".prisma": "Prisma",
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
  languageByExtension[extension] ?? extension;

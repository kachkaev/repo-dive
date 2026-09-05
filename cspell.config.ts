import { defineConfig } from "cspell";

export default defineConfig({
  dictionaries: ["cspell-words.txt"],
  dictionaryDefinitions: [
    {
      name: "cspell-words.txt",
      path: "./cspell-words.txt",
      addWords: true,
    },
  ],
  ignorePaths: [
    ".git/**",
    ".husky/_/**",
    "dist/**",
    "node_modules/**",
    "pnpm-lock.yaml",
  ],
  language: "en",
  minWordLength: 3,
  useGitignore: true,
});

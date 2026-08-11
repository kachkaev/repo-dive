import { generateBaseConfigs } from "@kachkaev/eslint-config-base";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  ...generateBaseConfigs({ tsconfigRootDir: import.meta.dirname }),

  {
    ignores: [".claude/**", ".husky/**", "dist/**"],
  },

  {
    // The dashboard build relies on React Compiler for memoization, and a
    // component that breaks the Rules of React silently bails out of it
    // instead of failing the build. These rules are the compiler's own
    // analysis surfaced at lint time, so a bail-out is caught while editing
    // rather than as an unexplained re-render later.
    ...reactHooks.configs.flat.recommended,
    files: ["dashboard/**/*.ts", "dashboard/**/*.tsx"],
  },

  {
    files: ["dashboard/**/*.ts", "dashboard/**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off", // The fetched dashboard.json crosses a trusted local boundary; a single cast beats hand-validating every series.
      "@typescript-eslint/explicit-module-boundary-types": "off", // React components and hooks are fine with inferred return types.
      "func-style": "off", // Small local helpers read naturally as const arrows next to component bodies.
      "import/no-default-export": "off", // Vite config files must default-export.
      "import/no-extraneous-dependencies": "off", // The dashboard is bundled by Vite, so its packages live in devDependencies by design.
      "unicorn/no-array-callback-reference": "off", // Passing named pure helpers to map/filter is idiomatic in the chart-shaping code.
    },
  },

  {
    files: ["examples/*/repo-dive.config.ts"],
    rules: {
      "import/no-default-export": "off", // repo-dive reads the config from the file's default export.
    },
  },

  {
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off", // `npm pack --json` and the size baseline we wrote ourselves cross a trusted local boundary; a cast beats hand-validating tool output.
    },
  },

  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off", // Effect-heavy APIs infer large Effect<Success, Error, Requirements> signatures; repeating them adds noise.
      "func-style": "off", // Effect code is typically composed from const-bound helpers that are easy to pass around and pipe.
      "unicorn/no-array-callback-reference": "off", // False positive for Effect.forEach(iterable, effect), which is not Array#forEach(callback, thisArg).
      "unicorn/no-array-method-this-argument": "off", // False positive for Effect.forEach(iterable, effect), which reuses array method names with different argument positions.
    },
  },
]);

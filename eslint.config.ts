import { generateBaseConfigs } from "@kachkaev/eslint-config-base";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...generateBaseConfigs({ tsconfigRootDir: import.meta.dirname }),

  {
    ignores: [".husky/**", "dist/**"],
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

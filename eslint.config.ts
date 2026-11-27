import {
  generateBaseConfigs,
  ruleArgsForIdLength,
  ruleArgsForNoRestrictedSyntax,
} from "@kachkaev/eslint-config-base";
import type { Linter } from "eslint";
import { defineConfig } from "eslint/config";
import eslintPluginBetterTailwindcss from "eslint-plugin-better-tailwindcss";
import {
  MatcherType,
  SelectorKind,
  type Selectors,
} from "eslint-plugin-better-tailwindcss/api/types";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Rules for every dashboard that styles with Tailwind. Each dashboard gets its
 * own config block with these rules, its own `entryPoint` and the selectors
 * that find its class strings.
 */
const ruleArgsForBetterTailwindcss = {
  "better-tailwindcss/enforce-consistent-class-order": "warn",
  "better-tailwindcss/enforce-consistent-important-position": "warn",
  "better-tailwindcss/enforce-consistent-variable-syntax": "warn",
  "better-tailwindcss/enforce-shorthand-classes": "warn",
  "better-tailwindcss/no-conflicting-classes": "warn",
  "better-tailwindcss/no-deprecated-classes": "warn",
  "better-tailwindcss/no-duplicate-classes": "warn",
  "better-tailwindcss/no-restricted-classes": "error",
  "better-tailwindcss/no-unknown-classes": "error",
  "better-tailwindcss/no-unnecessary-whitespace": "warn",
} satisfies Linter.RulesRecord;

/**
 * `className` and `xyzClassName` JSX attributes: a lone string, and every
 * string inside an expression (a ternary branch, a `cn(…)` argument).
 */
const selectorsForClassNameAttributes = [
  { kind: SelectorKind.Attribute, name: "^(.+C|c)lassName$" },
  {
    kind: SelectorKind.Attribute,
    name: "^(.+C|c)lassName$",
    match: [{ type: MatcherType.String }],
  },
] satisfies Selectors;

const classNamePattern = "/^(.+C|c)lassName$/";

/**
 * A `…ClassName` variable, object key or destructuring default. Keys inside
 * `cva(…)` are left out: the plugin lints its variants and compoundVariants.
 */
const classNameHolder = `:matches(VariableDeclarator[id.name=${classNamePattern}], Property[key.name=${classNamePattern}][computed=false]:not(CallExpression[callee.name="cva"] Property), AssignmentPattern[left.name=${classNamePattern}])`;

const messageForWrappingInCn =
  'Wrap the class string in `cn("…")`, so better-tailwindcss lints it.';

const messageForTemplateLiteral =
  'Replace the template literal with `cn(…)` arguments, e.g. `cn(someClassName, "…")`, so better-tailwindcss lints them and tailwind-merge resolves conflicts.';

/**
 * Keeps the React dashboard's class strings where the selectors above see
 * them, so none escapes the better-tailwindcss rules.
 */
const ruleArgsForNoRestrictedClassNameSyntax = [
  {
    selector: `${classNameHolder} > Literal[value=type(string)]:not([value=""])`,
    message: messageForWrappingInCn,
  },
  {
    selector: `${classNameHolder} > :matches(ConditionalExpression, LogicalExpression) > Literal[value=type(string)]:not([value=""])`,
    message: messageForWrappingInCn,
  },
  {
    // A `cn(…)` in a class attribute is left to the attribute rule below.
    selector: `:matches(${classNameHolder}, CallExpression[callee.name="cn"]:not(JSXAttribute[name.name=${classNamePattern}] CallExpression)) > TemplateLiteral[expressions.length>0]`,
    message: messageForTemplateLiteral,
  },
  {
    selector: `JSXAttribute[name.name=${classNamePattern}] TemplateLiteral[expressions.length>0]:not(MemberExpression[computed=true] > TemplateLiteral)`,
    message: messageForTemplateLiteral,
  },
  {
    selector: `JSXAttribute[name.name=${classNamePattern}] > JSXExpressionContainer > CallExpression[callee.name=cn][arguments.length=1][arguments.0.type=Literal]`,
    message:
      'Replace `className={cn("…")}` with `className="…"`: `cn` only earns its place when it merges several values, and the attribute is linted on its own.',
  },
];

/**
 * The Effect UI dashboard's `.class(…)` builder calls (`h.div.class("…")`):
 * a lone string argument, and every string inside an argument's expression
 * (a ternary branch, the right of `&&` or `??`). The plugin's default
 * selectors already cover `cn(…)`.
 */
const selectorsForClassCalls = [
  { kind: SelectorKind.Callee, name: "^class$" },
  {
    kind: SelectorKind.Callee,
    name: "^class$",
    match: [{ type: MatcherType.String }],
  },
] satisfies Selectors;

const classPattern = "/^(.+C|c)lass$/";

/** A `class` / `…Class` variable, object key or destructuring default. */
const classHolder = `:matches(VariableDeclarator[id.name=${classPattern}], Property[key.name=${classPattern}][computed=false], AssignmentPattern[left.name=${classPattern}])`;

/** A `.class(…)` builder call. */
const classCall =
  'CallExpression[callee.type="MemberExpression"][callee.property.name="class"]';

/**
 * Keeps the Effect UI dashboard's class strings where the selectors above see
 * them, so none escapes the better-tailwindcss rules.
 */
const ruleArgsForNoRestrictedClassSyntax = [
  {
    selector: `${classHolder} > Literal[value=type(string)]:not([value=""])`,
    message: messageForWrappingInCn,
  },
  {
    selector: `${classHolder} > :matches(ConditionalExpression, LogicalExpression) > Literal[value=type(string)]:not([value=""])`,
    message: messageForWrappingInCn,
  },
  {
    // A `cn(…)` in `.class(…)` arguments is left to the rules below.
    selector: `:matches(${classHolder}, CallExpression[callee.name="cn"]:not(${classCall} > CallExpression.arguments, ${classCall} > .arguments CallExpression)) > TemplateLiteral[expressions.length>0]`,
    message:
      'Replace the template literal with `cn(…)` arguments, e.g. `cn(someClass, "…")`, so better-tailwindcss lints them.',
  },
  {
    // Only in the arguments: a `.key(…)` earlier in the chain is the callee.
    selector: `TemplateLiteral[expressions.length>0]:matches(${classCall} > .arguments, ${classCall} > .arguments *):not(MemberExpression[computed=true] > TemplateLiteral)`,
    message:
      'Replace the template literal with separate arguments, e.g. `.class(someClass, "…")`, so better-tailwindcss lints them.',
  },
  {
    selector: `${classCall} > CallExpression[callee.name="cn"]`,
    message:
      "Pass the classes to `.class(…)` directly: it joins its arguments as `cn` does, and its strings are linted on their own.",
  },
];

export default defineConfig([
  generateBaseConfigs({ tsconfigRootDir: import.meta.dirname }),

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
    // Every Tailwind class value in the React dashboard is linted: the
    // `className` / `xyzClassName` JSX attributes (on top of the plugin's
    // default selectors, which already cover `cn(…)` and `cva(…)`), and any
    // other class string once it is wrapped in `cn("…")`.
    files: ["dashboard/src/**/*.ts", "dashboard/src/**/*.tsx"],
    plugins: { "better-tailwindcss": eslintPluginBetterTailwindcss },
    settings: {
      "better-tailwindcss": {
        entryPoint: `${import.meta.dirname}/dashboard/src/styles.css`,
        selectors: { extends: selectorsForClassNameAttributes },
      },
    },
    rules: {
      ...ruleArgsForBetterTailwindcss,
      "no-restricted-syntax": [
        ...ruleArgsForNoRestrictedSyntax,
        ...ruleArgsForNoRestrictedClassNameSyntax,
      ],
    },
  },

  {
    // Every Tailwind class value in the Effect UI dashboard is linted: the
    // arguments of `.class(…)` builder calls, and any other class string
    // once it is wrapped in `cn("…")`. The `lucide` and `visx-*` classes are
    // the markers the React dashboard's icons and visx marks render, copied
    // for the same DOM; no stylesheet defines them.
    files: ["dashboard-effect-ui/src/**/*.ts"],
    plugins: { "better-tailwindcss": eslintPluginBetterTailwindcss },
    settings: {
      "better-tailwindcss": {
        entryPoint: `${import.meta.dirname}/dashboard-effect-ui/src/styles.css`,
        selectors: { extends: selectorsForClassCalls },
      },
    },
    rules: {
      ...ruleArgsForBetterTailwindcss,
      "better-tailwindcss/no-unknown-classes": [
        "error",
        {
          ignore: [
            "^lucide$",
            // cspell:ignore linepath -- the class visx gives its LinePath
            "^visx-(group|rows|line|linepath|axis|axis-(tick|left|bottom|line))$",
          ],
        },
      ],
      "no-restricted-syntax": [
        ...ruleArgsForNoRestrictedSyntax,
        ...ruleArgsForNoRestrictedClassSyntax,
      ],
    },
  },

  {
    // The two dashboards know nothing of each other, so either folder can be
    // deleted on its own (see dashboard-effect-ui/README.md).
    files: [
      "dashboard/**/*.ts",
      "dashboard/**/*.tsx",
      "dashboard-effect-ui/**/*.ts",
    ],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./dashboard",
              from: "./dashboard-effect-ui",
              message:
                "The React dashboard must not depend on the Effect UI port.",
            },
            {
              target: "./dashboard-effect-ui",
              from: "./dashboard",
              message:
                "The Effect UI port copies what it needs from the React dashboard instead of importing it.",
            },
          ],
        },
      ],
    },
  },

  {
    files: [
      "dashboard-effect-ui/src/data.ts",
      "dashboard-effect-ui/src/app/shared/category-colors.test.ts",
      "dashboard-effect-ui/src/app/shared/measure-width.test.ts",
    ],
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off", // The fetched dashboard.json crosses a trusted local boundary (data.ts), the copied category-colors test reads its fixtures the same way, and the ResizeObserver stand-in builds a partial entry.
    },
  },

  {
    files: ["dashboard-effect-ui/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off", // Effect UI components and view functions infer large builder and component types; repeating them adds noise.
      "func-style": "off", // View functions are const arrows, as Effect UI's own docs write them.
      "id-length": [
        ruleArgsForIdLength[0],
        {
          ...ruleArgsForIdLength[1],
          // The one-letter names Effect UI fixes: `h` for view builders, `$`
          // in update handlers, `p` in headless components' parts and `s` for
          // a Story or Scene.
          exceptions: [
            ...ruleArgsForIdLength[1].exceptions,
            "h",
            "$",
            "p",
            "s",
          ],
        },
      ],
      "import/no-default-export": "off", // Vite config files must default-export.
      "import/no-extraneous-dependencies": "off", // The dashboard is bundled by Vite, so its packages live in devDependencies by design.
      "unicorn/no-array-callback-reference": "off", // Passing named pure helpers to map/filter is idiomatic in the chart-shaping code.
    },
  },

  {
    // Rules added in eslint-plugin-unicorn v65–v74 (via @kachkaev/eslint-config-base v2) that this
    // codebase does not adopt yet. Each is up for review in https://github.com/kachkaev/repo-dive/issues/212.
    rules: {
      "unicorn/consistent-boolean-name": "off", // Names like `dryRun` or `value` are part of the CLI's and components' public shape.
      "unicorn/max-nested-calls": "off", // Effect programs and CLI wiring are naturally deeply nested pipe/gen calls.
      "unicorn/no-break-in-nested-loop": "off",
      "unicorn/no-non-function-verb-prefix": "off", // Flags booleans such as `removeStale` and prepared statements such as `deleteNamespace`; the names are clear in context. // `continue` in a nested loop reads fine here; extracting functions for it adds noise.
      "unicorn/no-unreadable-for-of-expression": "off",
      "unicorn/single-line-block-comment-style": "off", // Single-line `/** … */` doc comments are the norm here; rewriting them into three-line blocks is churn without benefit. // Iterating over `map.entries()` or a filtered array inline is idiomatic here.
      "unicorn/require-array-sort-compare": "off", // Type-unaware: it also flags string arrays, where the default sort is what we want.
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
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "import/no-extraneous-dependencies": "off", // The CLI is bundled by Vite with only Node.js builtins external, so its packages live in devDependencies by design; src/config.ts, the one file shipped unbundled, has no imports. // Effect-heavy APIs infer large Effect<Success, Error, Requirements> signatures; repeating them adds noise.
      "func-style": "off", // Effect code is typically composed from const-bound helpers that are easy to pass around and pipe.
      "unicorn/no-array-callback-reference": "off", // False positive for Effect.forEach(iterable, effect), which is not Array#forEach(callback, thisArg).
      "unicorn/no-array-method-this-argument": "off", // False positive for Effect.forEach(iterable, effect), which reuses array method names with different argument positions.
    },
  },
]);

import { presets as effectPresets } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";

import aiSlopPlugin from "./libs/oxlint-plugin-decision-presets/dist/ai-slop.mjs";
import strictPlugin from "./libs/oxlint-plugin-decision-presets/dist/strict.mjs";

type Rules = Readonly<Record<string, "error" | readonly ["error", { readonly model: string }]>>;

const decisionModel = "openrouter/respan/span-01-lite";

const deciderModel = "openrouter/perplexity/pplx-decider-v1.1-27b";

const presetsDist = "./libs/oxlint-plugin-decision-presets/dist";

const deciderRuleIds: ReadonlySet<string> = new Set([
  "catch-hides-failure",
  "default-masks-missing-value",
  "reinvents-builtin",
]);

const allRulesOf = (
  plugin: Readonly<{ meta: { readonly name: string }; rules: object }>,
): Rules => {
  const ids = Object.keys(plugin.rules);
  const ruleOf = (id: string): string => `${plugin.meta.name}/${id}`;
  return {
    ...Object.fromEntries(ids.map((id) => [ruleOf(id), "error"] as const)),
    ...Object.fromEntries(
      ids
        .filter((id) => deciderRuleIds.has(id))
        .map((id) => [ruleOf(id), ["error", { model: deciderModel }]] as const),
    ),
  };
};

const decisionPresetRules: Rules = {
  ...allRulesOf(strictPlugin),
  ...allRulesOf(aiSlopPlugin),
};

const effectRules: Rules = Object.fromEntries(
  Object.values(effectPresets).flatMap((preset) =>
    Object.keys(preset.rules ?? {}).map((name) => [name, "error"] as const),
  ),
);

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["CHANGELOG.md"],
    sortImports: true,
    sortPackageJson: true,
  },
  lint: {
    ignorePatterns: ["libs/*/example/**"],
    plugins: [
      "eslint",
      "typescript",
      "unicorn",
      "oxc",
      "import",
      "jsdoc",
      "promise",
      "node",
      "vitest",
    ],
    categories: {
      correctness: "error",
      suspicious: "error",
      pedantic: "error",
      perf: "error",
      style: "error",
      restriction: "error",
      nursery: "error",
    },
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "no-comments", specifier: "eslint-plugin-no-comments" },
      { name: strictPlugin.meta.name, specifier: `${presetsDist}/strict.mjs` },
      { name: aiSlopPlugin.meta.name, specifier: `${presetsDist}/ai-slop.mjs` },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "no-comments/disallowComments": ["error", { allow: ["oxlint-disable", "eslint-disable"] }],
      ...effectRules,
      ...decisionPresetRules,
      "eslint/sort-imports": "off",
      "eslint/sort-keys": "off",
      "import/no-named-export": "off",
      "import/prefer-default-export": "off",
      "eslint/no-undef": "off",
      "typescript/promise-function-async": "off",
      "oxc/no-rest-spread-properties": "off",
      "node/no-top-level-await": "off",
      "eslint/one-var": ["error", "never"],
      "typescript/prefer-readonly-parameter-types": [
        "error",
        {
          ignoreInferredTypes: true,
          allow: [
            {
              from: "package",
              package: "@oxlint/plugins",
              name: ["Context", "Location", "Node", "Range", "SourceCode", "VisitorWithHooks"],
            },
            {
              from: "package",
              package: "effect",
              name: ["Cause", "Context", "Effect", "Exit", "Layer", "Option", "Ref", "Stream"],
            },
          ],
        },
      ],
      "eslint/no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
      "eslint/new-cap": ["error", { capIsNewExceptionPattern: "^(Config|Context|Data|Schema)\\." }],
      "vitest/require-hook": ["error", { allowedFunctionCalls: ["runAsWorker", "layer"] }],
      "typescript/no-empty-interface": ["error", { allowSingleExtends: true }],
      "typescript/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
    },
    overrides: [
      {
        files: [
          "**/*.config.ts",
          "libs/oxlint-plugin-decision/src/index.ts",
          "libs/oxlint-plugin-decision-presets/src/*.ts",
        ],
        rules: { "import/no-default-export": "off" },
      },
      {
        files: ["libs/*/tests/**"],
        rules: Object.fromEntries(Object.keys(decisionPresetRules).map((name) => [name, "off"])),
      },
    ],
    settings: {
      [strictPlugin.meta.name]: { model: decisionModel, timeoutMs: 60_000 },
      [aiSlopPlugin.meta.name]: { model: decisionModel, timeoutMs: 60_000 },
    },
    options: {
      typeAware: true,
      typeCheck: true,
      denyWarnings: true,
      reportUnusedDisableDirectives: "error",
    },
  },
  run: {
    cache: true,
    tasks: {
      verify: {
        command:
          "vp run -r build && vp check && vp run -r test && vp run actions-lint && vp run fallow && vp run audit",
        cache: false,
      },
      audit: {
        command: "vp pm audit",
        cache: false,
      },
      "actions-lint": {
        command:
          "uvx --from actionlint-py@1.7.12.25 actionlint && uvx zizmor@1.30.1 .github && ast-grep scan --rule .github/rules/no-full-history-checkout.yml .github/workflows",
        cache: {
          untrackedEnv: [
            "GH_TOKEN",
            "ZIZMOR_NO_ONLINE_AUDITS",
            "HTTPS_PROXY",
            "https_proxy",
            "NO_PROXY",
            "no_proxy",
            "SSL_CERT_FILE",
          ],
        },
      },
    },
  },
});

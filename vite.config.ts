import { presets as effectPresets } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";

type Rules = Readonly<Record<string, "error">>;

const decisionModel = "openrouter/respan/span-01-lite";

const presetsDist = "./libs/oxlint-plugin-decision-presets/dist";

const decisionRules = (plugin: string, ids: readonly string[]): Rules =>
  Object.fromEntries(ids.map((id) => [`${plugin}/${id}`, "error"] as const));

const decisionPresetRules: Rules = {
  ...decisionRules("decision-presets", [
    "no-pii-in-logs",
    "no-prompt-injection",
    "no-hardcoded-secrets",
    "name-matches-behavior",
    "untrusted-input-risk",
    "pure-name-is-pure",
    "safe-name-is-safe",
    "idempotent-name",
    "catch-hides-failure",
    "test-name-verifies-claim",
    "test-mocks-subject",
  ]),
  ...decisionRules("decision-ai-slop", [
    "redundant-guard",
    "default-masks-missing-value",
    "pass-through-wrapper",
    "placeholder-implementation",
    "comment-restates-code",
    "comment-narrates-history",
    "doc-restates-signature",
    "cast-instead-of-narrowing",
    "suppression-instead-of-fix",
    "reinvents-builtin",
  ]),
};

const decisionFalsePositives: Readonly<Record<string, readonly string[]>> = {
  "libs/oxlint-plugin-decision-presets/src/ai-slop-rules.ts": [
    "decision-presets/untrusted-input-risk",
  ],
  "libs/oxlint-plugin-decision-presets/src/ai-slop-select.ts": [
    "decision-ai-slop/reinvents-builtin",
  ],
  "libs/oxlint-plugin-decision-presets/src/claim-select.ts": [
    "decision-ai-slop/placeholder-implementation",
  ],
  "libs/oxlint-plugin-decision/src/define.ts": ["decision-ai-slop/placeholder-implementation"],
  "libs/oxlint-plugin-decision/src/explain.ts": [
    "decision-ai-slop/pass-through-wrapper",
    "decision-ai-slop/placeholder-implementation",
  ],
  "libs/oxlint-plugin-decision/src/locate.ts": [
    "decision-presets/catch-hides-failure",
    "decision-presets/name-matches-behavior",
  ],
  "libs/oxlint-plugin-decision/src/name.ts": ["decision-ai-slop/placeholder-implementation"],
  "libs/oxlint-plugin-decision/src/openrouter-worker.ts": [
    "decision-ai-slop/redundant-guard",
    "decision-presets/catch-hides-failure",
  ],
  "libs/oxlint-plugin-decision/src/openrouter.ts": [
    "decision-presets/catch-hides-failure",
    "decision-ai-slop/pass-through-wrapper",
  ],
  "libs/oxlint-plugin-decision/src/options.ts": [
    "decision-ai-slop/default-masks-missing-value",
    "decision-ai-slop/reinvents-builtin",
  ],
  "libs/oxlint-plugin-decision/src/plugin.ts": ["decision-ai-slop/default-masks-missing-value"],
  "libs/oxlint-plugin-decision/src/report.ts": [
    "decision-ai-slop/placeholder-implementation",
    "decision-presets/catch-hides-failure",
  ],
  "libs/oxlint-plugin-decision/src/runtime.ts": [
    "decision-ai-slop/default-masks-missing-value",
    "decision-presets/catch-hides-failure",
  ],
  "libs/oxlint-plugin-decision/src/visitor.ts": ["decision-ai-slop/placeholder-implementation"],
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
      { name: "decision-presets", specifier: `${presetsDist}/strict.mjs` },
      { name: "decision-ai-slop", specifier: `${presetsDist}/ai-slop.mjs` },
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
      ...Object.entries(decisionFalsePositives).map(([file, names]) => ({
        files: [file],
        rules: Object.fromEntries(names.map((name) => [name, "off"] as const)),
      })),
    ],
    settings: {
      "decision-presets": { model: decisionModel },
      "decision-ai-slop": { model: decisionModel },
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
          "vp run -r build && vp check && vp run -r test && vp run actions-lint && vp run fallow",
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

import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["../../dist/strict.mjs"],
  ignorePatterns: ["oxlint.config.ts", "review-only.config.ts"],
  rules: {
    "decision-presets/pure-name-is-pure": "error",
    "decision-presets/safe-name-is-safe": "error",
    "decision-presets/idempotent-name": "error",
    "decision-presets/catch-hides-failure": "error",
  },
  overrides: [
    {
      files: ["*.test.js"],
      rules: {
        "decision-presets/pure-name-is-pure": "off",
        "decision-presets/safe-name-is-safe": "off",
        "decision-presets/idempotent-name": "off",
        "decision-presets/catch-hides-failure": "off",
        "decision-presets/test-name-verifies-claim": "error",
        "decision-presets/test-mocks-subject": "error",
      },
    },
  ],
  settings: {
    "decision-presets": {
      maxMatchesPerFile: 100,
    },
  },
});

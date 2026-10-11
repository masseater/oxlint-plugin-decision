import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["../../dist/review-only.mjs"],
  ignorePatterns: ["oxlint.config.ts", "review-only.config.ts"],
  rules: {
    "decision-presets/fn-name-promises": "warn",
    "decision-presets/comment-describes-declaration": "warn",
    "decision-presets/comment-describes-block": "warn",
    "decision-presets/doc-errors-match-body": "warn",
    "decision-presets/error-message-matches-condition": "warn",
    "decision-presets/log-level-matches-event": "warn",
    "decision-presets/log-message-matches-event": "warn",
    "decision-presets/var-name-describes-value": "warn",
  },
  overrides: [
    {
      files: ["*.test.js"],
      rules: {
        "decision-presets/fn-name-promises": "off",
        "decision-presets/comment-describes-declaration": "off",
        "decision-presets/comment-describes-block": "off",
        "decision-presets/doc-errors-match-body": "off",
        "decision-presets/error-message-matches-condition": "off",
        "decision-presets/log-level-matches-event": "off",
        "decision-presets/log-message-matches-event": "off",
        "decision-presets/var-name-describes-value": "off",
        "decision-presets/describe-names-subject": "warn",
        "decision-presets/test-name-describes-code": "warn",
        "decision-presets/snapshot-only-behaviour-claim": "warn",
      },
    },
  ],
});

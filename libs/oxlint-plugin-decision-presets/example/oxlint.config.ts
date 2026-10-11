import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["../dist/strict.mjs"],
  ignorePatterns: ["oxlint.config.ts"],
  rules: {
    "decision-presets/no-pii-in-logs": "error",
    "decision-presets/no-prompt-injection": "error",
    "decision-presets/no-hardcoded-secrets": "error",
    "decision-presets/name-matches-behavior": "error",
    "decision-presets/no-swallowed-errors": "error",
    "decision-presets/untrusted-input-risk": "error",
  },
});

import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./plugin.mjs"],
  ignorePatterns: ["plugin.mjs", "oxlint.config.ts"],
  rules: {
    "team/no-pii-in-logs": "error",
    "team/name-matches-behavior": "error",
    "team/no-prompt-injection": "error",
  },
});

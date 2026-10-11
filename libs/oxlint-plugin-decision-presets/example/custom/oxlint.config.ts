import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./plugin.mjs"],
  ignorePatterns: ["plugin.mjs", "oxlint.config.ts"],
  rules: {
    "team/no-pii-in-logs": "error",
    "team/no-prompt-injection": "error",
    "team/no-hardcoded-secrets": "error",
    "team/no-direct-db-in-handlers": "error",
  },
});

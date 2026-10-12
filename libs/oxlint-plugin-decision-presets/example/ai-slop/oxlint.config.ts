import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["../../dist/ai-slop.mjs"],
  ignorePatterns: ["oxlint.config.ts"],
  rules: {
    "decision-ai-slop/redundant-guard": "error",
    "decision-ai-slop/default-masks-missing-value": "error",
    "decision-ai-slop/pass-through-wrapper": "error",
    "decision-ai-slop/placeholder-implementation": "error",
    "decision-ai-slop/comment-restates-code": "error",
    "decision-ai-slop/comment-narrates-history": "error",
    "decision-ai-slop/doc-restates-signature": "error",
    "decision-ai-slop/cast-instead-of-narrowing": "error",
    "decision-ai-slop/suppression-instead-of-fix": "error",
    "decision-ai-slop/reinvents-builtin": "error",
  },
});

import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/recommended.ts", "src/strict.ts", "src/review-only.ts"],
    platform: "node",
    sourcemap: true,
    tsconfig: "tsconfig.build.json",
    dts: {
      generator: "tsgo",
    },
  },
  test: {
    fileParallelism: false,
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**", "dist/**/*.mjs"],
      excludeAfterRemap: true,
      autoAttachSubprocess: true,
      reporter: ["text-summary", "json"],
    },
    projects: [
      {
        extends: true,
        test: { name: "mock", include: ["tests/**/*.test.ts"], exclude: ["tests/live.test.ts"] },
      },
      { extends: true, test: { name: "live", include: ["tests/live.test.ts"] } },
    ],
  },
  run: {
    tasks: {
      "test:live": {
        command: "vp test --project=live",
        dependsOn: ["build"],
        cache: false,
      },
    },
  },
});

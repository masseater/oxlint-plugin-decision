import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/openrouter-worker.ts"],
    platform: "node",
    sourcemap: true,
    deps: { resolveDepSubpath: true },
    dts: {
      generator: "tsgo",
    },
  },
  test: {
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**", "dist/**/*.mjs"],
      excludeAfterRemap: true,
      autoAttachSubprocess: true,
      reporter: ["text-summary", "json"],
    },
    projects: [
      { extends: true, test: { name: "mock", exclude: ["tests/live.test.ts"] } },
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

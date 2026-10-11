import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/openrouter-worker.ts"],
    platform: "node",
    deps: { resolveDepSubpath: true },
    dts: {
      generator: "tsgo",
    },
  },
  test: {
    fileParallelism: false,
    testTimeout: 120_000,
    projects: [
      { extends: true, test: { name: "mock", exclude: ["tests/live.test.ts"] } },
      { extends: true, test: { name: "live", include: ["tests/live.test.ts"] } },
    ],
  },
});

import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/worker.ts", "src/sync-jev.ts"],
    platform: "node",
    deps: { resolveDepSubpath: true },
    dts: {
      generator: "tsgo",
    },
  },
  test: {
    fileParallelism: false,
    testTimeout: 120000,
  },
});

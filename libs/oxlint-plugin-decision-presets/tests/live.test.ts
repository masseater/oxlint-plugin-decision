import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import { Array as Arr, Config, Effect, FileSystem, Option, Redacted } from "effect";

import { TIMEOUT, fromRoot, outputOf, oxlint, reportedLines, tempProject } from "./oxlint.ts";

const LIVE_MODEL = "openrouter/respan/span-01-lite";

const PROXY_ENV = [
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_ENV_PROXY",
  "SSL_CERT_FILE",
] as const;

const EXPECTED = [
  "fail.js:1:1: [no-hardcoded-secrets]",
  "fail.js:7:3: [no-pii-in-logs]",
  "fail.js:12:8: [no-prompt-injection]",
] as const;

const proxyEnv = Effect.map(
  Effect.all(PROXY_ENV.map((name) => Effect.orDie(Config.option(Config.String(name))))),
  (values) =>
    Object.fromEntries(
      Arr.zip(PROXY_ENV, values).flatMap(([name, value]) =>
        Option.match(value, { onNone: () => [], onSome: (found) => [[name, found] as const] }),
      ),
    ),
);

const ID_END = "]";
const LINE_START = 0;

const headOf = (line: string): string =>
  line.slice(LINE_START, line.indexOf(ID_END) + ID_END.length);

const recommendedLive = Effect.scoped(
  Effect.gen(function* test() {
    const fs = yield* FileSystem.FileSystem;
    const key = yield* Config.Redacted("OPENROUTER_API_KEY");
    const plugin = yield* fromRoot("dist", "recommended.mjs");
    const cwd = yield* tempProject({
      "fail.js": yield* fs.readFileString(yield* fromRoot("example", "fail.js")),
      "pass.js": yield* fs.readFileString(yield* fromRoot("example", "pass.js")),
      ".oxlintrc.json": JSON.stringify({
        jsPlugins: [plugin],
        rules: { "decision/ask": ["error", { model: LIVE_MODEL, ci: "fail" }] },
      }),
    });
    const run = yield* oxlint(
      cwd,
      ["--format", "unix", "-c", ".oxlintrc.json", "fail.js", "pass.js"],
      {
        ...(yield* proxyEnv),
        OPENROUTER_API_KEY: Redacted.value(key),
      },
    );
    yield* Effect.log(outputOf(run));
    deepStrictEqual(
      reportedLines(run, "decision").map((line) => headOf(line)),
      [...EXPECTED],
    );
  }),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "the recommended preset on Span-01 Lite",
  (it) => {
    it.effect("reports exactly the risky lines of the example", () => recommendedLive, TIMEOUT);
  },
);

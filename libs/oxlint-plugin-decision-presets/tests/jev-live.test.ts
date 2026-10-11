import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import { Array as Arr, Config, Effect, FileSystem, Option, Redacted } from "effect";

import { TIMEOUT, fromRoot, outputOf, oxlint, reportedLines, tempProject } from "./oxlint.ts";

const JEV = "decision-jev";
const LIVE_MODEL = "openrouter/respan/span-01-lite";
const LIVE_TIMEOUT_MS = 120_000;

const FORWARDED = [
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_ENV_PROXY",
  "SSL_CERT_FILE",
] as const;

const EXPECTED = [
  "cart.test.js:29:3: [test-mocks-subject]",
  "cart.test.js:35:1: [describe-names-subject]",
  "cart.js:4:8: [comment-describes-declaration]",
  "cart.js:18:8: [fn-name-promises]",
  "cart.js:28:8: [pure-name-is-pure]",
  "cart.js:34:8: [fn-name-promises]",
  "cart.js:34:8: [safe-name-is-safe]",
  "cart.js:34:8: [catch-hides-failure]",
  "cart.js:42:8: [catch-hides-failure]",
  "cart.js:47:5: [log-level-matches-event]",
];

const forwardedEnv = Effect.map(
  Effect.all(FORWARDED.map((name) => Effect.orDie(Config.option(Config.String(name))))),
  (values) =>
    Object.fromEntries(
      Arr.zip(FORWARDED, values).flatMap(([name, value]) =>
        Option.match(value, { onNone: () => [], onSome: (found) => [[name, found] as const] }),
      ),
    ),
);

const ID_END = "]";
const LINE_START = 0;

const headOf = (line: string): string =>
  line.slice(LINE_START, line.indexOf(ID_END) + ID_END.length);

const jevLive = Effect.scoped(
  Effect.gen(function* test() {
    const fs = yield* FileSystem.FileSystem;
    const key = yield* Config.Redacted("OPENROUTER_API_KEY");
    const example = yield* fromRoot("example", "jev");
    const config = yield* fs.readFileString(`${example}/.oxlintrc.json`);
    const cwd = yield* tempProject({
      "cart.js": yield* fs.readFileString(`${example}/cart.js`),
      "cart.test.js": yield* fs.readFileString(`${example}/cart.test.js`),
      ".oxlintrc.json": config
        .replace("../../dist/jev.mjs", yield* fromRoot("dist", "jev.mjs"))
        .replace(
          '"maxMatchesPerFile": 100',
          `"maxMatchesPerFile": 100, "model": "${LIVE_MODEL}", "timeoutMs": ${String(LIVE_TIMEOUT_MS)}`,
        ),
    });
    const run = yield* oxlint(
      cwd,
      ["--format", "unix", "-c", ".oxlintrc.json", "cart.js", "cart.test.js"],
      { ...(yield* forwardedEnv), OPENROUTER_API_KEY: Redacted.value(key) },
    );
    yield* Effect.log(outputOf(run));
    deepStrictEqual(
      reportedLines(run, JEV).map((line) => headOf(line)),
      EXPECTED,
    );
  }),
);

layer(NodeServices.layer, { excludeTestServices: true })("the jev rules on Span-01 Lite", (it) => {
  it.effect("report the planted mismatches in the jev example", () => jevLive, TIMEOUT);
});

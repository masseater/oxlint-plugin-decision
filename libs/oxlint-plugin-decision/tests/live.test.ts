import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Config, Effect, FileSystem, Option, Order, Path, Redacted } from "effect";
import type { Scope } from "effect";

import { TIMEOUT, outputOf } from "./fixtures.ts";
import { decisionLines, packageRoot, pluginPath, runOxlint, writeProject } from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const LIVE_MODEL = "openrouter/respan/span-01-lite";
const PROVIDER_FAILURE = /http \d+|network:|timeout|is not set/u;
const REPORTED = /^(?<where>\S+:\d+:\d+): \[(?<rule>[^\]]+)\]/u;

const EVERY_ANSWER = 0;
const EXAMPLE_MATCHES = 19;

const EXPECTED_REPORTS = Arr.sort(
  [
    "fail.js:3:8 name-matches-behavior",
    "fail.js:5:3 no-pii-in-logs",
    "fail.js:10:8 no-prompt-injection",
  ],
  Order.String,
);

const EXAMPLE_RULES = {
  "decision/no-pii-in-logs": "error",
  "decision/name-matches-behavior": "error",
  "decision/no-prompt-injection": "error",
};

const livePlugin = (example: string, dist: string, cutoff: string): string => `
import { createDecisionPlugin } from ${JSON.stringify(dist)};
import { rules } from ${JSON.stringify(example)};

export default createDecisionPlugin({
  model: ${JSON.stringify(LIVE_MODEL)},
  rules: rules.map((rule) => Object.assign({}, rule, ${cutoff})),
});
`;

const exampleProject = (cutoff: string): Effect.Effect<string, unknown, Services | Scope.Scope> =>
  Effect.gen(function* write() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* packageRoot;
    return yield* writeProject({
      "plugin.mjs": livePlugin(path.join(root, "example", "plugin.mjs"), yield* pluginPath, cutoff),
      ".oxlintrc.json": JSON.stringify({
        jsPlugins: ["./plugin.mjs"],
        rules: EXAMPLE_RULES,
      }),
      "fail.js": yield* fs.readFileString(path.join(root, "example", "fail.js")),
      "pass.js": yield* fs.readFileString(path.join(root, "example", "pass.js")),
    });
  });

const reportOf = (line: string): Option.Option<string> =>
  Option.fromNullishOr(REPORTED.exec(line)).pipe(
    Option.flatMap((found) => Option.fromUndefinedOr(found.groups)),
    Option.map((groups) => `${String(groups["where"])} ${String(groups["rule"])}`),
  );

const lintLive = (cutoff: string): Effect.Effect<readonly string[], unknown, Services> =>
  Effect.scoped(
    Effect.gen(function* lint() {
      const key = yield* Config.Redacted("OPENROUTER_API_KEY");
      const cwd = yield* exampleProject(cutoff);
      const run = yield* runOxlint({
        cwd,
        args: ["--format", "unix", "-c", ".oxlintrc.json", "fail.js", "pass.js"],
        env: { OPENROUTER_API_KEY: Redacted.value(key) },
      });
      const lines = decisionLines(run);
      yield* Effect.log(lines.join("\n"));
      strictEqual(PROVIDER_FAILURE.test(outputOf(run)), false, outputOf(run));
      return lines;
    }),
  );

const answersLive = Effect.gen(function* test() {
  const lines = yield* lintLive("{}");
  deepStrictEqual(
    Arr.sort(
      lines.flatMap((line) => Option.toArray(reportOf(line))),
      Order.String,
    ),
    EXPECTED_REPORTS,
  );
});

const probabilitiesLive = Effect.gen(function* test() {
  const lines = yield* lintLive(JSON.stringify({ cutoff: EVERY_ANSWER }));
  strictEqual(lines.length, EXAMPLE_MATCHES);
});

layer(NodeServices.layer, { excludeTestServices: true })("the live OpenRouter API", (it) => {
  it.effect(
    "reports exactly the example's violations without a provider failure",
    () => answersLive,
    TIMEOUT,
  );
  it.effect(
    "logs the probability of every answer about the example",
    () => probabilitiesLive,
    TIMEOUT,
  );
});

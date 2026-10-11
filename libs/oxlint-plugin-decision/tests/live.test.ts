import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import {
  Array as Arr,
  Config,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Redacted,
  Schema,
} from "effect";

import { TIMEOUT, lintProject, outputOf } from "./fixtures.ts";
import { decisionLines, packageRoot } from "./oxlint.ts";
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

const ExampleRule = Schema.Struct({
  id: Schema.String,
  target: Schema.Literals(["function", "call", "jsx", "file"]),
  question: Schema.String,
  cutoff: Schema.Number,
});

const ExamplePlugin = Schema.Struct({ rules: Schema.Array(ExampleRule) });

const exampleProject = Effect.gen(function* read() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* packageRoot;
  const url = yield* path.toFileUrl(path.join(root, "example", "plugin.mjs"));
  const plugin = yield* Effect.promise((): Promise<unknown> => import(url.href));
  const { rules } = yield* Schema.decodeUnknownEffect(ExamplePlugin)(plugin);
  const files = {
    "fail.js": yield* fs.readFileString(path.join(root, "example", "fail.js")),
    "pass.js": yield* fs.readFileString(path.join(root, "example", "pass.js")),
  };
  return { files, rules };
});

const reportOf = (line: string): Option.Option<string> =>
  Option.fromNullishOr(REPORTED.exec(line)).pipe(
    Option.flatMap((found) => Option.fromUndefinedOr(found.groups)),
    Option.map((groups) => `${String(groups["where"])} ${String(groups["rule"])}`),
  );

const lintLive = (
  rules: readonly (typeof ExampleRule.Type)[],
): Effect.Effect<readonly string[], unknown, Services> =>
  Effect.gen(function* lint() {
    const key = yield* Config.Redacted("OPENROUTER_API_KEY");
    const { files } = yield* exampleProject;
    const run = yield* lintProject({
      files,
      options: { rules, model: LIVE_MODEL },
      env: { OPENROUTER_API_KEY: Redacted.value(key) },
    });
    const lines = decisionLines(run);
    yield* Effect.log(lines.join("\n"));
    strictEqual(PROVIDER_FAILURE.test(outputOf(run)), false, outputOf(run));
    return lines;
  });

const answersLive = Effect.gen(function* test() {
  const { rules } = yield* exampleProject;
  const lines = yield* lintLive(rules);
  deepStrictEqual(
    Arr.sort(
      lines.flatMap((line) => Option.toArray(reportOf(line))),
      Order.String,
    ),
    EXPECTED_REPORTS,
  );
});

const probabilitiesLive = Effect.gen(function* test() {
  const { rules } = yield* exampleProject;
  const lines = yield* lintLive(
    rules.map(({ id, target, question }) => ({ id, target, question, cutoff: EVERY_ANSWER })),
  );
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

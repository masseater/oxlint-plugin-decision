import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, Option, Order, Schema } from "effect";

import { EXPLAIN_ENV } from "#src/explain.ts";
import type { DecisionPluginSetup } from "#src/types.ts";

import { RESPAN, TIMEOUT, callRule, lintProject, outputOf, withMock } from "./fixtures.ts";
import { decisionLines, mockEnv, projectFilesFor, runOxlint, writeProject } from "./oxlint.ts";

const SOURCE = "ok();\nconsole.log(user.email, user.phone);\n";
const LOG_ONLY = "console.log(user.email, user.phone);\n";
const FIRST_LINE = 1;
const HEAD = "state.snippets.s1:";
const LEAKS_LINE = 2;

const LEAKS = {
  kind: "classify",
  labels: { safe: "Logs nothing personal", leaks: "Logs personal data" },
  report: ["leaks"],
} as const;

const NO_TIME = 0;

const Probabilities = Schema.Record(Schema.String, Schema.Number);

const ExplainedLine = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  rule: Schema.String,
  model: Schema.String,
  cached: Schema.optionalKey(Schema.Boolean),
  durationMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(NO_TIME)),
  state: Schema.Struct({ chars: Schema.Number, head: Schema.String }),
  questions: Schema.Array(
    Schema.Struct({ id: Schema.String, question: Schema.String, probabilities: Probabilities }),
  ),
  verdict: Schema.optionalKey(Schema.Struct({ answer: Schema.String, probability: Schema.Number })),
  reported: Schema.Boolean,
});

type Explained = typeof ExplainedLine.Type;

const decodeLine = Schema.decodeUnknownOption(Schema.fromJsonString(ExplainedLine));

const recordsOf = (stderr: string): readonly Explained[] =>
  stderr.split("\n").flatMap((line) => Option.toArray(decodeLine(line)));

const recordAt = (records: readonly Explained[], line: number): Explained =>
  Option.getOrThrow(Arr.findFirst(records, (record) => record.line === line));

const silentByDefault = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "log.js": SOURCE },
    options: { rules: [callRule] },
    env,
  });
  strictEqual(run.stderr.includes("explain"), false, run.stderr);
  strictEqual(decisionLines(run).length, FIRST_LINE);
});

const textFromOption = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "log.js": SOURCE },
    options: { explain: true, rules: [callRule] },
    env,
  });
  assertInclude(
    run.stderr,
    "oxlint-plugin-decision explain: log.js:2:1 [any-call] openrouter/~typesafe/jev-latest (served openrouter/mock-decider) cached=no",
  );
  assertInclude(run.stderr, "  s1: yes=0.95\n    Consider only snippet");
  assertInclude(run.stderr, "  verdict: yes 0.95, cutoff 0.80, reported");
  assertInclude(run.stderr, "  verdict: yes 0.05, cutoff 0.80, not reported");
  strictEqual(decisionLines(run).length, FIRST_LINE);
});

const jsonFromEnv = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "log.js": SOURCE },
    options: { model: RESPAN, rules: [{ ...callRule, answer: LEAKS }] },
    env: { ...env, [EXPLAIN_ENV]: "json" },
  });
  const records = recordsOf(run.stderr);
  const { questions, state, durationMs, ...leaks } = recordAt(records, LEAKS_LINE);
  strictEqual(durationMs >= NO_TIME, true);
  deepStrictEqual(
    questions.map(({ id, probabilities }) => [id, probabilities]),
    [
      ["s1__safe", { yes: 0.3 }],
      ["s1__leaks", { yes: 0.9 }],
    ],
  );
  assertInclude(
    questions.map(({ question }) => question).join("\n"),
    'Does the label "safe" (Logs nothing personal) fit?',
  );
  assertInclude(state.head, HEAD);
  deepStrictEqual(leaks, {
    file: "log.js",
    line: LEAKS_LINE,
    rule: "any-call",
    model: RESPAN,
    cached: false,
    verdict: { answer: "leaks", probability: 0.9 },
    reported: true,
  });
  strictEqual(recordAt(records, FIRST_LINE).reported, false);
});

const modelPerRule = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "log.js": LOG_ONLY },
    options: {
      explain: "json",
      model: "openrouter/first",
      rules: [callRule, { ...callRule, id: "other-call" }],
    },
    ruleOptions: { "other-call": { model: "openrouter/second" } },
    env,
  });
  deepStrictEqual(
    Arr.sort(
      recordsOf(run.stderr).map(({ rule, model }) => `${rule} ${model}`),
      Order.String,
    ),
    ["any-call openrouter/first", "other-call openrouter/second"],
  );
});

const explainSetup: DecisionPluginSetup = { explain: "json", rules: [callRule] };

const cachedOnSecondRun = Effect.scoped(
  Effect.gen(function* test() {
    const env = yield* mockEnv("test-key");
    const cwd = yield* writeProject({
      "log.js": SOURCE,
      ...(yield* projectFilesFor(explainSetup)),
    });
    const lint = runOxlint({
      cwd,
      args: ["--format", "unix", "-c", "oxlint.config.ts", "log.js"],
      env,
    });
    const first = yield* lint;
    const second = yield* lint;
    strictEqual(recordAt(recordsOf(first.stderr), LEAKS_LINE).cached, false, outputOf(first));
    strictEqual(recordAt(recordsOf(second.stderr), LEAKS_LINE).cached, true, outputOf(second));
  }),
);

layer(NodeServices.layer, { excludeTestServices: true })("explain mode", (it) => {
  it.effect(
    "prints nothing extra unless it is turned on",
    () => withMock(silentByDefault),
    TIMEOUT,
  );
  it.effect(
    "prints each match's question, probabilities and verdict when the option is on",
    () => withMock(textFromOption),
    TIMEOUT,
  );
  it.effect(
    "prints JSON lines with each yes/no question a Respan model is asked",
    () => withMock(jsonFromEnv),
    TIMEOUT,
  );
  it.effect("names the model each rule was asked with", () => withMock(modelPerRule), TIMEOUT);
  it.effect("says when an answer came from the cache", () => withMock(cachedOnSecondRun), TIMEOUT);
});

import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, FileSystem, Option, Path } from "effect";

import { FAILED, PASSED, TIMEOUT, lintExample, modelOf, outputOf, withMock } from "./fixtures.ts";
import { loggedRequests } from "./mock-openrouter.ts";
import {
  cacheDirOf,
  decisionLines,
  diagnosticsOf,
  firstSpan,
  mockEnv,
  packageRoot,
  removeCache,
} from "./oxlint.ts";

const TWO = 2;
const FOUR = 4;
const SIGNATURE_LINE = 3;
const CALL_LINE = 5;
const RULE_IDS = ["no-pii-in-logs", "name-matches-behavior", "no-prompt-injection"] as const;
const SIGNATURE = "async function getUser(id) {";
const PII_CALL = 'console.log("loaded", user.email, user.phone)';
const PII_LINE =
  "example/fail.js:5:3: [no-pii-in-logs] openrouter/mock-decider answered yes (0.95 >= 0.80): Does this call write personal data, such as an email or phone number, to a log or console? [Error/team(no-pii-in-logs)]";

const firstRun = Effect.gen(function* run() {
  const root = yield* packageRoot;
  yield* removeCache(root);
  const env = yield* mockEnv("test-key");
  return { root, env, run: yield* lintExample(env) };
});

const reportsYes = Effect.gen(function* test() {
  const { run } = yield* firstRun;
  strictEqual(run.status, FAILED, outputOf(run));
  assertInclude(decisionLines(run).join("\n"), PII_LINE);
  deepStrictEqual(
    RULE_IDS.filter((id) => !run.stdout.includes(`[${id}]`)),
    [],
  );
  deepStrictEqual(
    decisionLines(run).filter((line) => !line.startsWith("example/fail.js")),
    [],
  );
});

const oneRequestPerFile = Effect.gen(function* test() {
  yield* firstRun;
  const requests = yield* loggedRequests;
  deepStrictEqual(
    requests.map(({ authorization }) => authorization),
    ["Bearer test-key", "Bearer test-key"],
  );
  deepStrictEqual(
    requests.map((request) => modelOf(request)),
    ["~typesafe/jev-latest", "~typesafe/jev-latest"],
  );
});

const corruptCache = (
  root: string,
): Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* corrupt() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* cacheDirOf(root);
    const entries = yield* fs.readDirectory(dir);
    yield* Effect.all(entries.map((entry) => fs.writeFileString(path.join(dir, entry), "{}")));
  });

const cachesAnswers = Effect.gen(function* test() {
  const { root, env, run } = yield* firstRun;
  const cached = yield* lintExample(env);
  strictEqual((yield* loggedRequests).length, TWO);
  deepStrictEqual(decisionLines(cached), decisionLines(run));
  yield* corruptCache(root);
  const reasked = yield* lintExample(env);
  strictEqual((yield* loggedRequests).length, FOUR);
  deepStrictEqual(decisionLines(reasked), decisionLines(run));
});

const lengthOnLine = (
  spans: readonly { readonly line: number; readonly length: number }[],
  line: number,
): Option.Option<number> =>
  Arr.findFirst(spans, (span) => span.line === line).pipe(Option.map(({ length }) => length));

const underlines = Effect.gen(function* test() {
  const { env } = yield* firstRun;
  const diagnostics = yield* diagnosticsOf(yield* lintExample(env, "json"));
  const spans = diagnostics.map((diagnostic) => firstSpan(diagnostic));
  deepStrictEqual(
    [lengthOnLine(spans, SIGNATURE_LINE), lengthOnLine(spans, CALL_LINE)],
    [Option.some(SIGNATURE.length), Option.some(PII_CALL.length)],
  );
});

const failsInCi = Effect.gen(function* test() {
  const run = yield* lintExample({ CI: "1" }, "default");
  strictEqual(run.status === PASSED, false);
  assertInclude(outputOf(run), "OPENROUTER_API_KEY is not set");
});

const skipsOutsideCi = Effect.gen(function* test() {
  const run = yield* lintExample({});
  strictEqual(run.status, PASSED, outputOf(run));
  assertInclude(run.stderr, "OPENROUTER_API_KEY is not set, skipping openrouter models");
  deepStrictEqual(decisionLines(run), []);
});

layer(NodeServices.layer, { excludeTestServices: true })("the example project", (it) => {
  it.effect("reports each rule the model answered yes to", () => withMock(reportsYes), TIMEOUT);
  it.effect(
    "sends one request per file with the key and default model",
    () => withMock(oneRequestPerFile),
    TIMEOUT,
  );
  it.effect(
    "answers a second run from the cache and re-asks a malformed entry",
    () => withMock(cachesAnswers),
    TIMEOUT,
  );
  it.effect(
    "underlines a function's signature and a call's whole expression",
    () => withMock(underlines),
    TIMEOUT,
  );
  it.effect("fails the run by default when the key is missing under CI", () => failsInCi, TIMEOUT);
  it.effect("warns and skips when the key is missing outside CI", () => skipsOutsideCi, TIMEOUT);
});

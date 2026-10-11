import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, Option, Order } from "effect";

import type { RuleContext } from "#src/types.ts";

import {
  FAILED,
  PASSED,
  TIMEOUT,
  callRule,
  lintProject,
  modelOf,
  outputOf,
  questionCount,
  withMock,
} from "./fixtures.ts";
import { MockOpenRouterLayer, loggedRequests } from "./mock-openrouter.ts";
import type { LoggedRequest } from "./mock-openrouter.ts";
import { decisionLines, mockEnv } from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const ONE = 1;
const TWO = 2;
const THREE = 3;
const CAP = 25;
const ROWS = 30;
const LOG_LINE = "console.log(user.email, user.phone);\n";
const AROUND =
  "const before = 1;\nfunction handler() {\n  console.log(user.email, user.phone);\n}\n";

const askedTwins = Effect.gen(function* test() {
  const text = "first();\nf<T>(x);\nlast();\n";
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "same.js": text, "same.ts": text },
    options: { rules: [callRule] },
    env,
  });
  strictEqual(run.status, PASSED, outputOf(run));
  const counts = (yield* loggedRequests).map((request) => questionCount(request));
  deepStrictEqual(Arr.sort(counts, Order.Number), [TWO, THREE]);
});

const capped = Effect.gen(function* test() {
  const rows = Arr.replicate('console.log("row", user.email, user.phone);', ROWS).join("\n");
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "rows.js": `${rows}\n` },
    options: { maxMatchesPerFile: CAP, rules: [callRule] },
    env,
  });
  deepStrictEqual(
    (yield* loggedRequests).map((request) => questionCount(request)),
    [CAP],
  );
  assertInclude(run.stderr, "30 matches exceeded maxMatchesPerFile=25, 5 not checked");
  assertInclude(run.stderr, "rows.js");
  strictEqual(decisionLines(run).length, CAP);
  strictEqual(run.status, FAILED);
});

const sortedModels = (requests: readonly LoggedRequest[]): readonly string[] =>
  Arr.sort(
    requests.map((request) => modelOf(request)),
    Order.String,
  );

const perModel = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "log.js": LOG_LINE },
    options: { model: ["openrouter/first", "openrouter/second"], rules: [callRule] },
    env,
  });
  deepStrictEqual(sortedModels(yield* loggedRequests), ["first", "second"]);
  deepStrictEqual(
    decisionLines(run).map((line) => line.replace(/ answered.*/u, "")),
    [
      "log.js:1:1: [any-call] openrouter/mock-decider",
      "log.js:1:1: [any-call] openrouter/mock-second",
    ],
  );
});

const ruleModel = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  yield* lintProject({
    files: { "log.js": LOG_LINE },
    options: { model: "openrouter/first", rules: [{ ...callRule, model: "openrouter/second" }] },
    env,
  });
  deepStrictEqual(sortedModels(yield* loggedRequests), ["second"]);
});

const textState = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "log.js": LOG_LINE },
    options: { model: "openrouter/respan/span-01-lite", rules: [callRule] },
    env,
  });
  deepStrictEqual(
    (yield* loggedRequests).map(({ sentState }) => sentState),
    ["state.snippets.s0:\nconsole.log(user.email, user.phone)"],
  );
  strictEqual(decisionLines(run).length, ONE);
});

const contextFor = (
  context: RuleContext,
): Effect.Effect<Option.Option<string>, unknown, Services> =>
  Effect.gen(function* ask() {
    const env = yield* mockEnv("test-key");
    yield* lintProject({
      files: { "log.js": AROUND },
      options: { rules: [{ ...callRule, context }] },
      env,
    });
    const requests = yield* loggedRequests;
    return Arr.head(requests).pipe(
      Option.flatMap(({ body }) => Option.fromUndefinedOr(body.state.contexts)),
      Option.flatMap((contexts) => Option.fromUndefinedOr(contexts["s0"])),
    );
  }).pipe(Effect.provide(MockOpenRouterLayer));

const contexts = Effect.gen(function* test() {
  deepStrictEqual(yield* contextFor({ scope: "node" }), Option.none());
  deepStrictEqual(
    yield* contextFor({ scope: "lines", before: ONE, after: ONE }),
    Option.some("L2| function handler() {\nL3|   console.log(user.email, user.phone);\nL4| }"),
  );
  deepStrictEqual(
    yield* contextFor({ scope: "enclosing", kind: "function" }),
    Option.some("function handler() {\n  console.log(user.email, user.phone);\n}"),
  );
  deepStrictEqual(yield* contextFor({ scope: "file" }), Option.some(AROUND));
});

layer(NodeServices.layer, { excludeTestServices: true })("linting a project", (it) => {
  it.effect(
    "asks separately about files with the same text but different parses",
    () => withMock(askedTwins),
    TIMEOUT,
  );
  it.effect(
    "caps a file at maxMatchesPerFile and names the dropped tail",
    () => withMock(capped),
    TIMEOUT,
  );
  it.effect(
    "reports each model's yes as its own diagnostic, one request per model",
    () => withMock(perModel),
    TIMEOUT,
  );
  it.effect("sends Respan models their state as text", () => withMock(textState), TIMEOUT);
  it.effect("lets a rule override the default model", () => withMock(ruleModel), TIMEOUT);
  it.effect("sends the source a rule's context scope asks for", () => contexts, TIMEOUT);
});

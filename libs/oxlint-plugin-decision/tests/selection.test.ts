import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, Order } from "effect";

import type { DecisionRule } from "#src/types.ts";

import { PASSED, TIMEOUT, callRule, lintProject, outputOf, withMock } from "./fixtures.ts";
import { loggedRequests } from "./mock-openrouter.ts";
import { decisionLines, mockEnv } from "./oxlint.ts";

const functionRule: DecisionRule = {
  id: "any-function",
  target: "function",
  question: "Does this function log personal data?",
  cutoff: 0.8,
};

const NAMED = [
  "function computeTotal() { return 1; }",
  "const computeTax = () => 2;",
  "const handlers = { computeFee() { return 3; } };",
  "class Cart { computeSum() { return 4; } }",
  "function save() { return 5; }",
  "[1].map(() => 6);",
  "",
].join("\n");

const COMMENTED = [
  "/** Logs the user. */",
  "export function first() { console.log(user.email, user.phone); }",
  "",
  "function second() { return 2; }",
  "// Adds one.",
  "// Always.",
  "const third = (x) => x + 1;",
  "",
].join("\n");

const sentSnippets = loggedRequests.pipe(
  Effect.map((requests) =>
    Arr.sort(
      requests.flatMap(({ body }) => Object.values(body.state.snippets)),
      Order.String,
    ),
  ),
);

const byName = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "names.js": NAMED },
    options: {
      rules: [
        { ...functionRule, select: (_node, { name = "" }): boolean => name.startsWith("compute") },
      ],
    },
    env,
  });
  strictEqual(run.status, PASSED, outputOf(run));
  deepStrictEqual(yield* sentSnippets, [
    "computeFee() { return 3; }",
    "computeSum() { return 4; }",
    "computeTax = () => 2",
    "function computeTotal() { return 1; }",
  ]);
});

const byCallee = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  yield* lintProject({
    files: { "calls.js": "console.log(user.email, user.phone);\nlogger.log(1);\nrun();\n" },
    options: {
      rules: [
        {
          ...callRule,
          select: (node): boolean =>
            node.type === "CallExpression" &&
            node.callee.type === "MemberExpression" &&
            node.callee.object.type === "Identifier" &&
            node.callee.object.name === "console",
        },
      ],
    },
    env,
  });
  deepStrictEqual(yield* sentSnippets, ["console.log(user.email, user.phone)"]);
});

const byElement = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  yield* lintProject({
    files: { "view.jsx": "const a = <Button>Hi</Button>;\nconst b = <div>Hi</div>;\n" },
    options: {
      rules: [
        {
          ...callRule,
          target: "jsx",
          select: (_node, { name = "" }): boolean => name !== name.toLowerCase(),
        },
      ],
    },
    env,
  });
  deepStrictEqual(yield* sentSnippets, ["<Button>Hi</Button>"]);
});

const withComment = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "commented.js": COMMENTED },
    options: {
      rules: [{ ...functionRule, context: { scope: "comment" }, message: "Short message." }],
    },
    env,
  });
  deepStrictEqual(yield* sentSnippets, [
    "/** Logs the user. */\nexport function first() { console.log(user.email, user.phone); }",
    "// Adds one.\n// Always.\nconst third = (x) => x + 1",
  ]);
  deepStrictEqual(
    decisionLines(run).map((line) => line.replace(/^.*\): /u, "")),
    ["Short message. [Error/decision(any-function)]"],
  );
});

const refusesNonFunction = Effect.gen(function* test() {
  const run = yield* lintProject({
    files: { "pass.js": "ok();\n" },
    options: { rules: [{ ...callRule, ...JSON.parse('{"select":"console"}') }] },
    env: {},
    format: "default",
  });
  strictEqual(run.status === PASSED, false);
  assertInclude(outputOf(run), "select");
});

layer(NodeServices.layer, { excludeTestServices: true })("choosing what to ask about", (it) => {
  it.effect(
    "asks only about functions the selector picks by name",
    () => withMock(byName),
    TIMEOUT,
  );
  it.effect(
    "asks only about calls the selector picks from the AST",
    () => withMock(byCallee),
    TIMEOUT,
  );
  it.effect(
    "asks only about elements the selector picks by tag",
    () => withMock(byElement),
    TIMEOUT,
  );
  it.effect(
    "sends the comment above a match and skips matches without one",
    () => withMock(withComment),
    TIMEOUT,
  );
  it.effect("refuses a select that is not a function", () => refusesNonFunction, TIMEOUT);
});

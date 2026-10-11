import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, Order } from "effect";

import type { DecisionRule } from "#src/types.ts";

import { PASSED, TIMEOUT, callRule, lintProject, modelOf, outputOf, withMock } from "./fixtures.ts";
import { loggedRequests } from "./mock-openrouter.ts";
import { decisionLines, mockEnv } from "./oxlint.ts";

const LOG_LINE = "console.log(user.email, user.phone);\n";

const otherRule: DecisionRule = { ...callRule, id: "other-call" };

const perRuleModel = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "log.js": LOG_LINE },
    options: {
      model: "openrouter/first",
      rules: [callRule, { ...otherRule, model: "openrouter/third" }],
    },
    ruleOptions: { "other-call": { model: "openrouter/second" } },
    env,
  });
  deepStrictEqual(
    Arr.sort(
      (yield* loggedRequests).map((request) => modelOf(request)),
      Order.String,
    ),
    ["first", "second"],
  );
  deepStrictEqual(
    Arr.sort(
      decisionLines(run).map((line) => line.replace(/ answered.*/u, "")),
      Order.String,
    ),
    [
      "log.js:1:1: [any-call] openrouter/mock-decider",
      "log.js:1:1: [other-call] openrouter/mock-second",
    ],
  );
});

const badRuleOptions = Effect.gen(function* test() {
  const env = yield* mockEnv("test-key");
  const run = yield* lintProject({
    files: { "log.js": LOG_LINE },
    options: { rules: [callRule] },
    ruleOptions: { "any-call": { model: "nowhere" } },
    env,
    format: "default",
  });
  strictEqual(run.status === PASSED, false, outputOf(run));
  assertInclude(outputOf(run), 'model "nowhere" must be "<provider>/<model>"');
});

layer(NodeServices.layer)("rule options in the oxlint config", (it) => {
  it.effect(
    "override one rule's model and keep the others on the plugin model",
    () => withMock(perRuleModel),
    TIMEOUT,
  );
  it.effect("reject an invalid rule option", () => withMock(badRuleOptions), TIMEOUT);
});

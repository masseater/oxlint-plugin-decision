import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, Option } from "effect";

import type { RuleAnswer } from "#src/types.ts";

import { TIMEOUT, callRule, lintProject, withMock } from "./fixtures.ts";
import { loggedRequests } from "./mock-openrouter.ts";
import type { MockOpenRouter } from "./mock-openrouter.ts";
import { decisionLines, mockEnv } from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const SOURCE = "ok();\nconsole.log(user.email, user.phone);\n";

const answered = (
  answer: RuleAnswer,
  expected: readonly string[],
): Effect.Effect<void, unknown, Services | MockOpenRouter> =>
  Effect.gen(function* test() {
    const env = yield* mockEnv("test-key");
    const run = yield* lintProject({
      files: { "log.js": SOURCE },
      options: { rules: [{ ...callRule, answer }] },
      env,
    });
    deepStrictEqual(decisionLines(run), expected);
  });

const classify = answered(
  {
    kind: "classify",
    labels: { safe: "Logs nothing personal", leaks: "Logs personal data" },
    report: ["leaks"],
  },
  [
    "log.js:2:1: [any-call] openrouter/mock-decider answered leaks (0.99 >= 0.80): Does this call write personal data to a log? [Error/decision(ask)]",
  ],
);

const severity = answered({ kind: "severity" }, [
  "log.js:2:1: [any-call] openrouter/mock-decider answered error (0.99 >= 0.80): Does this call write personal data to a log? [Error/decision(ask)]",
]);

const severityAboveError = answered({ kind: "severity", minimum: "error" }, [
  "log.js:2:1: [any-call] openrouter/mock-decider answered error (0.99 >= 0.80): Does this call write personal data to a log? [Error/decision(ask)]",
]);

const asksChoice = Effect.gen(function* test() {
  yield* severity;
  const question = Arr.head(yield* loggedRequests).pipe(
    Option.flatMap(({ body }) => Option.fromUndefinedOr(body.questions["s0"])),
    Option.map(({ type, criteria }) => ({ type, criteria })),
  );
  deepStrictEqual(
    question,
    Option.some({
      type: "choice",
      criteria: {
        none: "No problem",
        info: "Worth noting, but not a problem",
        warn: "Likely a problem",
        error: "Clearly a problem",
      },
    }),
  );
});

layer(NodeServices.layer, { excludeTestServices: true })("answer kinds", (it) => {
  it.effect(
    "reports a classify rule only for the labels it lists",
    () => withMock(classify),
    TIMEOUT,
  );
  it.effect(
    "reports a severity rule at or above warn by default",
    () => withMock(severity),
    TIMEOUT,
  );
  it.effect("honours a severity rule's minimum", () => withMock(severityAboveError), TIMEOUT);
  it.effect(
    "asks a severity rule as a choice between the four levels",
    () => withMock(asksChoice),
    TIMEOUT,
  );
});

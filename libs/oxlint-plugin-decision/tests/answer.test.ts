import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, Option, Order } from "effect";

import type { DecisionOptions, RuleAnswer } from "#src/types.ts";

import { TIMEOUT, callRule, lintProject, withMock } from "./fixtures.ts";
import { loggedRequests } from "./mock-openrouter.ts";
import type { MockOpenRouter } from "./mock-openrouter.ts";
import { decisionLines, mockEnv } from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const SOURCE = "ok();\nconsole.log(user.email, user.phone);\n";

const RESPAN = "openrouter/respan/span-01-lite";

const answered = (
  answer: RuleAnswer,
  expected: readonly string[],
  options: DecisionOptions = {},
): Effect.Effect<void, unknown, Services | MockOpenRouter> =>
  Effect.gen(function* test() {
    const env = yield* mockEnv("test-key");
    const run = yield* lintProject({
      files: { "log.js": SOURCE },
      options: { ...options, rules: [{ ...callRule, answer }] },
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

const LEAKS = {
  kind: "classify",
  labels: { safe: "Logs nothing personal", leaks: "Logs personal data" },
  report: ["leaks"],
} as const;

const classifyYesNo = answered(
  LEAKS,
  [
    "log.js:2:1: [any-call] openrouter/mock-decider answered leaks (0.90 >= 0.80): Does this call write personal data to a log? [Error/decision(ask)]",
  ],
  { model: RESPAN },
);

const severityYesNo = answered(
  { kind: "severity" },
  [
    "log.js:2:1: [any-call] openrouter/mock-decider answered error (0.85 >= 0.80): Does this call write personal data to a log? [Error/decision(ask)]",
  ],
  { model: RESPAN },
);

const questionIdsSent = loggedRequests.pipe(
  Effect.map((requests) =>
    Arr.sort(
      requests.flatMap(({ body }) =>
        Object.entries(body.questions).map(([id, { type }]) => `${id} ${type}`),
      ),
      Order.String,
    ),
  ),
);

const asksYesNo = Effect.gen(function* test() {
  yield* classifyYesNo;
  deepStrictEqual(yield* questionIdsSent, [
    "s0__leaks noul",
    "s0__safe noul",
    "s1__leaks noul",
    "s1__safe noul",
  ]);
});

const asksLevels = Effect.gen(function* test() {
  yield* severityYesNo;
  deepStrictEqual(yield* questionIdsSent, [
    "s0__error noul",
    "s0__info noul",
    "s0__warn noul",
    "s1__error noul",
    "s1__info noul",
    "s1__warn noul",
  ]);
});

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
    "asks yes/no-only models one question per classify label and reports the likeliest",
    () => withMock(asksYesNo),
    TIMEOUT,
  );
  it.effect(
    "asks yes/no-only models whether a match reaches each severity level",
    () => withMock(asksLevels),
    TIMEOUT,
  );
  it.effect(
    "asks a severity rule as a choice between the four levels",
    () => withMock(asksChoice),
    TIMEOUT,
  );
});

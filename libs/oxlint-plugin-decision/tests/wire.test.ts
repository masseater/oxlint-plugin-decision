import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import { Effect } from "effect";

import type { Answers, DecisionRequest, NoulAnswer } from "#src/types.ts";
import { mergeResponses, wireRequestsFor } from "#src/wire.ts";

import { TIMEOUT } from "./fixtures.ts";

const RESPAN = "respan/span-01-lite";
const SERVED = "respan/span-01-lite-20260925";
const TINY = 0.125;
const LOW = 0.25;
const HALF = 0.5;
const HIGH = 0.875;

type Scores = Readonly<Record<string, number>>;

const SEVERITY = {
  none: "No problem",
  info: "Worth noting, but not a problem",
  warn: "Likely a problem",
  error: "Clearly a problem",
} as const;

const classifyRequest = (model: string): DecisionRequest => ({
  model,
  state: { snippets: { s0: "f()" } },
  questions: {
    s0: {
      type: "choice",
      instructions: "How is it?",
      criteria: { safe: "Fine", leaks: "Leaks data" },
    },
  },
});

const severityRequest: DecisionRequest = {
  model: RESPAN,
  state: { snippets: { s0: "f()" } },
  questions: { s0: { type: "choice", instructions: "Is it risky?", criteria: SEVERITY } },
};

const yes = (noul: number): NoulAnswer => ({ type: "noul", noul });

const yesAnswers = (scores: Scores): Answers =>
  Object.fromEntries(Object.entries(scores).map(([id, noul]) => [id, yes(noul)]));

const merged = (request: DecisionRequest, scores: Scores): unknown =>
  mergeResponses(request, [{ model: SERVED, answers: yesAnswers(scores) }]);

const choiceOf = (scores: Scores, choice: string, probabilities: Scores): unknown => ({
  model: SERVED,
  answers: { ...yesAnswers(scores), s0: { type: "choice", choice, probabilities } },
});

const keepsChoice = Effect.sync(() => {
  const request = classifyRequest("~typesafe/jev-latest");
  deepStrictEqual(wireRequestsFor(request), [request]);
});

const splitsLabels = Effect.sync(() => {
  deepStrictEqual(wireRequestsFor(classifyRequest(RESPAN)), [
    {
      model: RESPAN,
      state: "state.snippets.s0:\nf()",
      questions: {
        s0__safe: { type: "noul", instructions: 'How is it? Does the label "safe" (Fine) fit?' },
        s0__leaks: {
          type: "noul",
          instructions: 'How is it? Does the label "leaks" (Leaks data) fit?',
        },
      },
    },
  ]);
});

const picksLabel = Effect.sync(() => {
  const scores = { s0__safe: LOW, s0__leaks: HIGH };
  deepStrictEqual(
    merged(classifyRequest(RESPAN), scores),
    choiceOf(scores, "leaks", { safe: LOW, leaks: HIGH }),
  );
});

const missingLabel = Effect.sync(() => {
  const scores = { s0__safe: LOW };
  deepStrictEqual(merged(classifyRequest(RESPAN), scores), {
    model: SERVED,
    answers: yesAnswers(scores),
  });
});

const splitsLevels = Effect.sync(() => {
  deepStrictEqual(
    wireRequestsFor(severityRequest).map(({ questions }) => questions),
    [
      {
        s0__info: {
          type: "noul",
          instructions:
            'Is it risky? Is it at least as serious as "info" (Worth noting, but not a problem)?',
        },
        s0__warn: {
          type: "noul",
          instructions: 'Is it risky? Is it at least as serious as "warn" (Likely a problem)?',
        },
        s0__error: {
          type: "noul",
          instructions: 'Is it risky? Is it at least as serious as "error" (Clearly a problem)?',
        },
      },
    ],
  );
});

const picksLevel = Effect.sync(() => {
  const scores = { s0__info: HIGH, s0__warn: HALF, s0__error: LOW };
  deepStrictEqual(
    merged(severityRequest, scores),
    choiceOf(scores, "info", { none: TINY, info: HIGH, warn: HALF, error: LOW }),
  );
});

const raisesLevels = Effect.sync(() => {
  const scores = { s0__info: LOW, s0__warn: TINY, s0__error: HIGH };
  deepStrictEqual(
    merged(severityRequest, scores),
    choiceOf(scores, "error", { none: TINY, info: HIGH, warn: HIGH, error: HIGH }),
  );
});

const noLevel = Effect.sync(() => {
  const scores = { s0__info: HALF, s0__warn: TINY, s0__error: TINY };
  deepStrictEqual(
    merged(severityRequest, scores),
    choiceOf(scores, "none", { none: HALF, info: HALF, warn: TINY, error: TINY }),
  );
});

layer(NodeServices.layer, { excludeTestServices: true })(
  "choice questions for yes/no-only models",
  (it) => {
    it.effect(
      "keeps one choice question for models that answer choices",
      () => keepsChoice,
      TIMEOUT,
    );
    it.effect("asks one yes/no question per classify label", () => splitsLabels, TIMEOUT);
    it.effect("picks the label with the highest yes probability", () => picksLabel, TIMEOUT);
    it.effect(
      "leaves the choice unanswered when a label has no answer",
      () => missingLabel,
      TIMEOUT,
    );
    it.effect(
      "asks one at-least question per severity level above none",
      () => splitsLevels,
      TIMEOUT,
    );
    it.effect("picks the most serious level the model is confident in", () => picksLevel, TIMEOUT);
    it.effect("raises a level to the yes of a more serious one", () => raisesLevels, TIMEOUT);
    it.effect("answers none when no level reaches 0.8", () => noLevel, TIMEOUT);
  },
);

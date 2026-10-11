import { Option, Result, Schema } from "effect";

import type { Question, RuleAnswer, Severity, Verdict } from "./types.ts";

const YES = "yes";
const DEFAULT_MINIMUM: Severity = "warn";
const MINIMUM_LABELS = 2;

const SEVERITY_CRITERIA = {
  none: "No problem",
  info: "Worth noting, but not a problem",
  warn: "Likely a problem",
  error: "Clearly a problem",
} as const;

const SEVERITY_ORDER: readonly string[] = Object.keys(SEVERITY_CRITERIA);

const Probability = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

const Label = Schema.NonEmptyString;

const BooleanAnswer = Schema.Struct({ kind: Schema.Literal("boolean") });

const ClassifyAnswer = Schema.Struct({
  kind: Schema.Literal("classify"),
  labels: Schema.Record(Label, Schema.String).check(Schema.isMinProperties(MINIMUM_LABELS)),
  report: Schema.NonEmptyArray(Label),
}).check(
  Schema.makeFilter(({ labels, report }) => report.every((label) => Object.hasOwn(labels, label)), {
    message: "every label in report must be one of labels",
  }),
);

const SeverityAnswer = Schema.Struct({
  kind: Schema.Literal("severity"),
  minimum: Schema.optionalKey(Schema.Literals(["info", "warn", "error"])),
});

const RuleAnswerSchema = Schema.Union([BooleanAnswer, ClassifyAnswer, SeverityAnswer]);

const BOOLEAN_ANSWER: RuleAnswer = { kind: "boolean" };

const decodeAnswer = Schema.decodeUnknownResult(RuleAnswerSchema);

const decodeRuleAnswer = (answer: unknown): Result.Result<RuleAnswer, string> => {
  const decoded = decodeAnswer(answer);
  if (Result.isSuccess(decoded)) {
    return Result.succeed(decoded.success);
  }
  return Result.fail(decoded.failure.message);
};

const NoulAnswer = Schema.Struct({ noul: Probability });

const choiceAnswerOf = (labels: readonly string[]): Schema.Decoder<ChoiceVerdict> =>
  Schema.Struct({
    type: Schema.Literal("choice"),
    choice: Schema.Literals(labels),
    probabilities: Schema.Record(Schema.String, Probability),
  });

interface ChoiceVerdict {
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>>;
}

const questionFor = (answer: RuleAnswer, instructions: string): Question => {
  switch (answer.kind) {
    case "classify": {
      return {
        type: "choice",
        instructions: `${instructions} Select the label that fits best.`,
        criteria: answer.labels,
      };
    }
    case "severity": {
      return {
        type: "choice",
        instructions: `${instructions} Rate how serious the problem is, and select none if there is no problem.`,
        criteria: SEVERITY_CRITERIA,
      };
    }
    case "boolean": {
      return { type: "noul", instructions };
    }
    default: {
      return { type: "noul", instructions };
    }
  }
};

const choiceVerdictOf = (labels: readonly string[], raw: unknown): Option.Option<Verdict> =>
  Schema.decodeUnknownOption(choiceAnswerOf(labels))(raw).pipe(
    Option.flatMap(({ choice, probabilities }) =>
      Option.fromUndefinedOr(probabilities[choice]).pipe(
        Option.map((probability) => ({ answer: choice, probability })),
      ),
    ),
  );

const verdictOf = (question: Question, raw: unknown): Option.Option<Verdict> => {
  if (question.type === "choice") {
    return choiceVerdictOf(Object.keys(question.criteria), raw);
  }
  return Schema.decodeUnknownOption(NoulAnswer)(raw).pipe(
    Option.map(({ noul }) => ({ answer: YES, probability: noul })),
  );
};

const rankOf = (label: string): number => SEVERITY_ORDER.indexOf(label);

const severityMatches = (
  { minimum = DEFAULT_MINIMUM }: { readonly minimum?: Severity },
  label: string,
): boolean => rankOf(label) >= rankOf(minimum);

const answerMatches = (answer: RuleAnswer, label: string): boolean => {
  switch (answer.kind) {
    case "classify": {
      return answer.report.includes(label);
    }
    case "severity": {
      return severityMatches(answer, label);
    }
    case "boolean": {
      return label === YES;
    }
    default: {
      return false;
    }
  }
};

const isReported = (
  rule: { readonly answer: RuleAnswer; readonly cutoff: number },
  verdict: Verdict,
): boolean => verdict.probability >= rule.cutoff && answerMatches(rule.answer, verdict.answer);

export { BOOLEAN_ANSWER, SEVERITY_ORDER, decodeRuleAnswer, isReported, questionFor, verdictOf };

import { Option, Result, Schema } from "effect";

import { Probability, RuleAnswerSchema } from "./schema.ts";
import type {
  Answer,
  ChoiceAnswer,
  NoulAnswer,
  Question,
  RuleAnswer,
  Severity,
  Verdict,
} from "./types.ts";

const YES = "yes";
const DEFAULT_MINIMUM: Severity = "warn";

const SEVERITY_CRITERIA = {
  none: "No problem",
  info: "Worth noting, but not a problem",
  warn: "Likely a problem",
  error: "Clearly a problem",
} as const;

const SEVERITY_ORDER: readonly string[] = Object.keys(SEVERITY_CRITERIA);

const BOOLEAN_ANSWER: RuleAnswer = { kind: "boolean" };

const decodeAnswer = Schema.decodeUnknownResult(RuleAnswerSchema);

const decodeRuleAnswer = (answer: unknown): Result.Result<RuleAnswer, string> => {
  const decoded = decodeAnswer(answer);
  if (Result.isSuccess(decoded)) {
    return Result.succeed(decoded.success);
  }
  return Result.fail(decoded.failure.message);
};

const NoulAnswerSchema = Schema.Struct({ type: Schema.Literal("noul"), noul: Probability });

const ChoiceAnswerSchema = Schema.Struct({
  type: Schema.Literal("choice"),
  choice: Schema.String,
  probabilities: Schema.optional(Schema.Record(Schema.String, Probability)),
});

const AnswerSchema = Schema.Union([NoulAnswerSchema, ChoiceAnswerSchema]);

const decodeNoul = Schema.decodeOption(NoulAnswerSchema);

const decodeChoice = Schema.decodeOption(ChoiceAnswerSchema);

const isNoul = (answer: Answer): answer is NoulAnswer => answer.type === "noul";

const isChoice = (answer: Answer): answer is ChoiceAnswer => answer.type === "choice";

const noulOf = (answer: Answer | undefined): Option.Option<NoulAnswer> =>
  Option.fromUndefinedOr(answer).pipe(Option.filter(isNoul), Option.flatMap(decodeNoul));

const choiceOf = (answer: Answer | undefined): Option.Option<ChoiceAnswer> =>
  Option.fromUndefinedOr(answer).pipe(Option.filter(isChoice), Option.flatMap(decodeChoice));

const probabilityOfChoice = ({ choice, probabilities }: ChoiceAnswer): Option.Option<number> =>
  Option.fromUndefinedOr(probabilities).pipe(
    Option.flatMap((byLabel) => Option.fromUndefinedOr(byLabel[choice])),
  );

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

const choiceVerdictOf = (
  criteria: Readonly<Record<string, unknown>>,
  answer: Answer | undefined,
): Option.Option<Verdict> =>
  choiceOf(answer).pipe(
    Option.filter(({ choice }) => Object.hasOwn(criteria, choice)),
    Option.flatMap((chosen) =>
      Option.map(probabilityOfChoice(chosen), (probability) => ({
        answer: chosen.choice,
        probability,
      })),
    ),
  );

const verdictOf = (question: Question, answer: Answer | undefined): Option.Option<Verdict> => {
  if (question.type === "choice") {
    return choiceVerdictOf(question.criteria, answer);
  }
  return noulOf(answer).pipe(Option.map(({ noul }) => ({ answer: YES, probability: noul })));
};

const severityMatches = (
  { minimum = DEFAULT_MINIMUM }: { readonly minimum?: Severity },
  label: string,
): boolean => SEVERITY_ORDER.indexOf(label) >= SEVERITY_ORDER.indexOf(minimum);

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

export {
  AnswerSchema,
  BOOLEAN_ANSWER,
  SEVERITY_ORDER,
  choiceOf,
  decodeRuleAnswer,
  isReported,
  noulOf,
  probabilityOfChoice,
  questionFor,
  verdictOf,
};

import type { Location } from "@oxlint/plugins";
import { Array as Arr, Boolean as Bool, Number as Num, Option, Predicate, Schema } from "effect";

import type {
  ChoiceQuestion,
  DecisionRequest,
  LineRange,
  Question,
  RequestMatch,
  RuleLocation,
  Verdicts,
} from "./types.ts";

const CHOICE_OPTION_LIMIT = 254;
const FIRST_LINE = 1;
const MINIMUM_WIDTH = 1;
const UNKNOWN_CHOICE = "unknown";
const LOCATION_SUFFIX = "_location";
const TRUNCATION_MARKER = "/* ...truncated */";

const refAt = (index: number): string => `s${String(index)}`;

const locationRefOf = (ref: string): string => `${ref}${LOCATION_SUFFIX}`;

const truncateSnippet = (text: string, maxChars: number): string =>
  Bool.match(text.length <= maxChars, {
    onTrue: () => text,
    onFalse: () => `${text.slice(Num.decrement(FIRST_LINE), maxChars)}${TRUNCATION_MARKER}`,
  });

const sourceLines = (text: string): readonly string[] => text.split(/\r\n|[\n\r\u2028\u2029]/u);

type LocatedMatch = RequestMatch & {
  readonly rule: { readonly question: string; readonly location: RuleLocation };
};

const locates = (match: RequestMatch): match is LocatedMatch =>
  Predicate.isNotUndefined(match.rule.location) && !match.truncated;

interface NumberedLine {
  readonly text: string;
  readonly line: number;
}

const EVERY_LINE: LineRange = { start: FIRST_LINE, end: Number.POSITIVE_INFINITY };

const isWithin = (line: number, within: LineRange): boolean =>
  Num.between(line, { minimum: within.start, maximum: within.end });

const rangeKey = ({ start, end }: LineRange): string =>
  Bool.match(start === end, {
    onTrue: () => `L${String(start)}`,
    onFalse: () => `L${String(start)}-L${String(end)}`,
  });

const rangeLabel = ({ start, end }: LineRange): string =>
  Bool.match(start === end, {
    onTrue: () => `Line ${String(start)}`,
    onFalse: () => `Lines ${String(start)} to ${String(end)}`,
  });

const rangeOf = (group: Arr.NonEmptyReadonlyArray<NumberedLine>): LineRange => ({
  start: Arr.headNonEmpty(group).line,
  end: Arr.lastNonEmpty(group).line,
});

const numberedLines = (snippet: string): readonly NumberedLine[] =>
  sourceLines(snippet).map((text, index) => ({ text, line: Num.sum(index, FIRST_LINE) }));

const locationCandidates = (
  snippet: string,
  within: LineRange = EVERY_LINE,
): Readonly<Record<string, LineRange>> => {
  const lines = numberedLines(snippet).filter(
    ({ text, line }) => text.trim().length >= FIRST_LINE && isWithin(line, within),
  );
  const width = Math.max(MINIMUM_WIDTH, Math.ceil(lines.length / CHOICE_OPTION_LIMIT));
  return Object.fromEntries(
    Arr.chunksOf(lines, width).map((group) => {
      const range = rangeOf(group);
      return [rangeKey(range), range];
    }),
  );
};

const locationQuestion = (
  match: LocatedMatch,
  ref: string,
  candidates: Readonly<Record<string, LineRange>>,
): ChoiceQuestion => ({
  type: "choice",
  instructions: `Consider only the numbered source in state.snippets.${ref}. If it violates this rule, select the line (or range containing that line) to annotate. Rule: ${match.rule.question} Location: ${match.rule.location.question} If multiple violations exist, select the earliest one. Select ${UNKNOWN_CHOICE} if no violation exists or its location is unclear.`,
  criteria: {
    ...Object.fromEntries(
      Object.entries(candidates).map(([key, range]) => [key, rangeLabel(range)]),
    ),
    [UNKNOWN_CHOICE]: "No clear source location for this violation",
  },
});

const Probability = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

const ChoiceAnswer = Schema.Struct({
  type: Schema.Literal("choice"),
  choice: Schema.String,
  probabilities: Schema.Record(Schema.String, Probability),
});

const NoulAnswer = Schema.Struct({ noul: Probability });

const Response = Schema.Struct({
  model: Schema.NonEmptyString,
  answers: Schema.Record(Schema.String, Schema.Unknown),
});

const decodeChoice = Schema.decodeUnknownOption(ChoiceAnswer);
const decodeNoul = Schema.decodeUnknownOption(NoulAnswer);
const decodeResponse = Schema.decodeUnknownOption(Response);

type ChoiceCriteria = ChoiceQuestion["criteria"];

const validChoice = (answer: unknown, criteria: ChoiceCriteria): boolean =>
  Option.exists(
    decodeChoice(answer),
    ({ choice, probabilities }) =>
      Object.hasOwn(criteria, choice) && Object.hasOwn(probabilities, choice),
  );

const selectedLocation = (
  answer: unknown,
  candidates: Readonly<Record<string, LineRange>>,
  cutoff: number,
): Option.Option<LineRange> =>
  decodeChoice(answer).pipe(
    Option.filter(({ choice, probabilities }) =>
      Option.exists(Option.fromUndefinedOr(probabilities[choice]), (probability) =>
        Num.isGreaterThanOrEqualTo(probability, cutoff),
      ),
    ),
    Option.flatMap(({ choice }) => Option.fromUndefinedOr(candidates[choice])),
  );

const locationOfLine = (snippet: string, line: number): Location => {
  const text = Option.getOrElse(
    Arr.get(sourceLines(snippet), Num.decrement(line)),
    () => "",
  );
  return {
    start: { line, column: Math.max(Num.decrement(FIRST_LINE), text.search(/\S/u)) },
    end: { line, column: text.trimEnd().length },
  };
};

const numbered = (snippet: string): string =>
  numberedLines(snippet)
    .map(({ text, line }) => `L${String(line)}| ${text}`)
    .join("\n");

const noulFor = (match: RequestMatch, ref: string): readonly [string, Question] => [
  ref,
  {
    type: "noul",
    instructions: `Consider only snippet "${ref}" in state.snippets. ${match.rule.question}`,
  },
];

const questionsFor = (
  match: RequestMatch,
  ref: string,
): readonly (readonly [string, Question])[] => {
  if (!locates(match)) {
    return [noulFor(match, ref)];
  }
  return [
    noulFor(match, ref),
    [locationRefOf(ref), locationQuestion(match, ref, locationCandidates(match.snippet))],
  ];
};

const snippetFor = (match: RequestMatch): string => {
  if (locates(match)) {
    return numbered(match.snippet);
  }
  return match.snippet;
};

const buildRequest = (model: string, matches: readonly RequestMatch[]): DecisionRequest => ({
  model,
  state: {
    snippets: Object.fromEntries(
      matches.map((match, index) => [refAt(index), snippetFor(match)]),
    ),
  },
  questions: Object.fromEntries(
    matches.flatMap((match, index) => questionsFor(match, refAt(index))),
  ),
});

const choiceQuestionsOf = (
  request: DecisionRequest,
): readonly (readonly [string, ChoiceCriteria])[] =>
  Object.entries(request.questions).flatMap(([id, question]) => {
    if (question.type === "choice") {
      return [[id, question.criteria] as const];
    }
    return [];
  });

const noulRefsOf = (request: DecisionRequest): readonly string[] =>
  Object.entries(request.questions)
    .filter(([, question]) => question.type === "noul")
    .map(([id]) => id);

const scoreOf = (answers: Readonly<Record<string, unknown>>, ref: string): number =>
  Option.getOrThrowWith(
    Option.map(decodeNoul(answers[ref]), ({ noul }) => noul),
    () => new Error(`response has no probability in [0, 1] for "${ref}"`),
  );

const parseVerdicts = (json: unknown, request: DecisionRequest): Verdicts => {
  const { model, answers } = Option.getOrThrowWith(
    decodeResponse(json),
    () => new Error("response has no model id or answers object"),
  );
  const scores = Object.fromEntries(
    noulRefsOf(request).map((ref) => [ref, scoreOf(answers, ref)]),
  );
  const complete = choiceQuestionsOf(request).every(([id, criteria]) =>
    validChoice(answers[id], criteria),
  );
  return { model, scores, answers, complete };
};

export {
  buildRequest,
  locates,
  locationCandidates,
  locationOfLine,
  locationQuestion,
  locationRefOf,
  parseVerdicts,
  refAt,
  selectedLocation,
  truncateSnippet,
};
export type { LocatedMatch };

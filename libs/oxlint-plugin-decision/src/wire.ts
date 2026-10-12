import type { DecisionsRequest } from "@openrouter/sdk/models";
import {
  Array as Arr,
  Boolean as Bool,
  Number as Num,
  Option,
  Order,
  Predicate,
  pipe,
} from "effect";

import { SEVERITY_ORDER, noulOf } from "./answer.ts";
import { snippetRefOf } from "./request.ts";
import type {
  Answers,
  ChoiceAnswer,
  ChoiceQuestion,
  DecisionRequest,
  DecisionResponse,
  NoulQuestion,
  Question,
} from "./types.ts";

type State = DecisionRequest["state"];

type ChoiceCriteria = ChoiceQuestion["criteria"];

interface WireRequest extends Readonly<Pick<DecisionsRequest, "model" | "state" | "questions">> {
  readonly state: DecisionRequest["state"] | string;
  readonly questions: Readonly<Record<string, Question>>;
}

const RESPAN_MODELS = ["respan/"] as const;
const OPTION_SEPARATOR = "__";
const CERTAIN = 1;
const LIKELY = 0.5;
const NO_SEVERITY = "none";

const sectionsOf = (name: string, entries: Readonly<Record<string, string>>): readonly string[] =>
  Object.entries(entries).map(([ref, text]) => `state.${name}.${ref}:\n${text}`);

const stateAsText = ({ snippets, contexts = {} }: State): string =>
  [...sectionsOf("snippets", snippets), ...sectionsOf("contexts", contexts)].join("\n\n");

const isRespan = (model: string): boolean =>
  RESPAN_MODELS.some((prefix) => model.startsWith(prefix));

const only = (
  entries: Readonly<Record<string, string>>,
  ref: string,
): Readonly<Record<string, string>> =>
  Option.match(Option.fromUndefinedOr(entries[ref]), {
    onNone: () => ({}),
    onSome: (text) => ({ [ref]: text }),
  });

const stateOf = ({ snippets, contexts }: State, ref: string): State => {
  if (Predicate.isUndefined(contexts)) {
    return { snippets: only(snippets, ref) };
  }
  return { snippets: only(snippets, ref), contexts: only(contexts, ref) };
};

const optionIdOf = (id: string, label: string): string => `${id}${OPTION_SEPARATOR}${label}`;

const isSeverityScale = (criteria: ChoiceCriteria): boolean =>
  Object.keys(criteria).join(",") === SEVERITY_ORDER.join(",");

const optionText = (label: string, description: string | null): string =>
  Option.match(Option.fromNullishOr(description), {
    onNone: () => `"${label}"`,
    onSome: (text) => `"${label}" (${text})`,
  });

const labelQuestion = (
  instructions: string,
  label: string,
  description: string | null,
): NoulQuestion => ({
  type: "noul",
  instructions: `${instructions} Does the label ${optionText(label, description)} fit?`,
});

const levelQuestion = (
  instructions: string,
  label: string,
  description: string | null,
): NoulQuestion => ({
  type: "noul",
  instructions: `${instructions} Is it at least as serious as ${optionText(label, description)}?`,
});

const levelsAboveNone = (criteria: ChoiceCriteria): readonly (readonly [string, string | null])[] =>
  Object.entries(criteria).filter(([label]) => label !== NO_SEVERITY);

const yesNoQuestionsOf = (
  id: string,
  { instructions, criteria }: ChoiceQuestion,
): readonly (readonly [string, NoulQuestion])[] => {
  if (isSeverityScale(criteria)) {
    return levelsAboveNone(criteria).map(([label, description]) => [
      optionIdOf(id, label),
      levelQuestion(instructions, label, description),
    ]);
  }
  return Object.entries(criteria).map(([label, description]) => [
    optionIdOf(id, label),
    labelQuestion(instructions, label, description),
  ]);
};

const asYesNo = ([id, question]: readonly [string, Question]): readonly (readonly [
  string,
  Question,
])[] => {
  if (question.type === "choice") {
    return yesNoQuestionsOf(id, question);
  }
  return [[id, question]];
};

const perSnippet = (request: DecisionRequest): Arr.NonEmptyReadonlyArray<WireRequest> => {
  const wires = Object.values(
    Arr.groupBy(Object.entries(request.questions), ([id]) => snippetRefOf(id)),
  ).map((questions): WireRequest => {
    const [[id]] = questions;
    return {
      model: request.model,
      state: stateAsText(stateOf(request.state, snippetRefOf(id))),
      questions: Object.fromEntries(questions.flatMap((entry) => asYesNo(entry))),
    };
  });
  if (Arr.isReadonlyArrayNonEmpty(wires)) {
    return wires;
  }
  return [request];
};

const wireRequestsFor = (request: DecisionRequest): Arr.NonEmptyReadonlyArray<WireRequest> => {
  if (isRespan(request.model)) {
    return perSnippet(request);
  }
  return [request];
};

interface Score {
  readonly label: string;
  readonly yes: number;
}

const byYes = Order.mapInput(Order.Number, ({ yes }: Score) => yes);

const scoreOf = (answers: Answers, id: string, label: string): Option.Option<Score> =>
  Option.map(noulOf(answers[optionIdOf(id, label)]), ({ noul }) => ({ label, yes: noul }));

const scoresOf = (
  answers: Answers,
  id: string,
  labels: readonly string[],
): Option.Option<Arr.NonEmptyReadonlyArray<Score>> =>
  Option.flatMap(Option.all(labels.map((label) => scoreOf(answers, id, label))), (scores) =>
    Option.liftPredicate(scores, Arr.isArrayNonEmpty),
  );

const probabilitiesOf = (scores: readonly Score[]): Readonly<Record<string, number>> =>
  Object.fromEntries(scores.map(({ label, yes }) => [label, yes]));

const choiceAnswer = (
  choice: string,
  probabilities: Readonly<Record<string, number>>,
): ChoiceAnswer => ({
  type: "choice",
  choice,
  probabilities,
});

const bestLabel = (scores: Arr.NonEmptyReadonlyArray<Score>): ChoiceAnswer =>
  choiceAnswer(Arr.max(scores, byYes).label, probabilitiesOf(scores));

const atLeast = (scores: Arr.NonEmptyReadonlyArray<Score>): Arr.NonEmptyReadonlyArray<Score> =>
  pipe(
    scores,
    Arr.map(({ label }, index) => ({
      label,
      yes: Math.max(...scores.slice(index).map(({ yes }) => yes)),
    })),
  );

const severityLevel = (scores: Arr.NonEmptyReadonlyArray<Score>): ChoiceAnswer => {
  const cumulative = atLeast(scores);
  const probabilities = {
    [NO_SEVERITY]: Num.subtract(CERTAIN, Arr.headNonEmpty(cumulative).yes),
    ...probabilitiesOf(cumulative),
  };
  const reached = pipe(
    cumulative,
    Arr.findLast(({ yes }) => yes >= LIKELY),
  );
  return choiceAnswer(
    Option.match(reached, { onNone: () => NO_SEVERITY, onSome: ({ label }) => label }),
    probabilities,
  );
};

const labelsAsked = (criteria: ChoiceCriteria): readonly string[] => {
  if (isSeverityScale(criteria)) {
    return levelsAboveNone(criteria).map(([label]) => label);
  }
  return Object.keys(criteria);
};

const choiceFromYesNo = (
  answers: Answers,
  [id, { criteria }]: readonly [string, ChoiceQuestion],
): readonly (readonly [string, ChoiceAnswer])[] => {
  const collapse = Bool.match(isSeverityScale(criteria), {
    onTrue: () => severityLevel,
    onFalse: () => bestLabel,
  });
  return scoresOf(answers, id, labelsAsked(criteria)).pipe(
    Option.map((scores) => [id, collapse(scores)] as const),
    Option.toArray,
  );
};

const choiceQuestionsOf = (
  request: DecisionRequest,
): readonly (readonly [string, ChoiceQuestion])[] =>
  Object.entries(request.questions).flatMap(([id, question]) => {
    if (question.type === "choice") {
      return [[id, question] as const];
    }
    return [];
  });

const withChoices = (request: DecisionRequest, answers: Answers): Answers => {
  if (!isRespan(request.model)) {
    return answers;
  }
  return {
    ...answers,
    ...Object.fromEntries(
      choiceQuestionsOf(request).flatMap((entry) => choiceFromYesNo(answers, entry)),
    ),
  };
};

const mergeResponses = (
  request: DecisionRequest,
  responses: Arr.NonEmptyReadonlyArray<DecisionResponse>,
): DecisionResponse => ({
  ...Arr.headNonEmpty(responses),
  answers: withChoices(
    request,
    Object.fromEntries(responses.flatMap(({ answers }) => Object.entries(answers))),
  ),
});

export { mergeResponses, wireRequestsFor };
export type { WireRequest };

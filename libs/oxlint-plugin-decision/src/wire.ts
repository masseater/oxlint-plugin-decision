import { Array as Arr, Option, Predicate } from "effect";

import { snippetRefOf } from "./request.ts";
import type { DecisionRequest, Question } from "./types.ts";

type State = DecisionRequest["state"];

interface WireRequest {
  readonly model: string;
  readonly state: DecisionRequest["state"] | string;
  readonly questions: Readonly<Record<string, Question>>;
}

const TEXT_STATE_MODELS = ["respan/"] as const;

const sectionsOf = (name: string, entries: Readonly<Record<string, string>>): readonly string[] =>
  Object.entries(entries).map(([ref, text]) => `state.${name}.${ref}:\n${text}`);

const stateAsText = ({ snippets, contexts = {} }: State): string =>
  [...sectionsOf("snippets", snippets), ...sectionsOf("contexts", contexts)].join("\n\n");

const usesTextState = (model: string): boolean =>
  TEXT_STATE_MODELS.some((prefix) => model.startsWith(prefix));

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

const perSnippet = (request: DecisionRequest): readonly WireRequest[] =>
  Object.values(Arr.groupBy(Object.entries(request.questions), ([id]) => snippetRefOf(id))).map(
    (questions) => {
      const [[id]] = questions;
      return {
        model: request.model,
        state: stateAsText(stateOf(request.state, snippetRefOf(id))),
        questions: Object.fromEntries(questions),
      };
    },
  );

const wireRequestsFor = (request: DecisionRequest): readonly WireRequest[] => {
  if (usesTextState(request.model)) {
    return perSnippet(request);
  }
  return [request];
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Predicate.isObject(value) && !Array.isArray(value);

const answersOf = (response: unknown): Readonly<Record<string, unknown>> => {
  if (isRecord(response) && isRecord(response["answers"])) {
    return response["answers"];
  }
  return {};
};

const mergeResponses = (responses: readonly unknown[]): unknown => ({
  ...Option.getOrElse(Option.filter(Arr.head(responses), isRecord), () => ({})),
  answers: Object.fromEntries(responses.flatMap((response) => Object.entries(answersOf(response)))),
});

export { mergeResponses, wireRequestsFor };
export type { WireRequest };

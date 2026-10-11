import type { DecisionRequest } from "./types.ts";

const TEXT_STATE_MODELS = ["respan/"] as const;

const sectionsOf = (name: string, entries: Readonly<Record<string, string>>): readonly string[] =>
  Object.entries(entries).map(([ref, text]) => `state.${name}.${ref}:\n${text}`);

const stateAsText = ({ snippets, contexts = {} }: DecisionRequest["state"]): string =>
  [...sectionsOf("snippets", snippets), ...sectionsOf("contexts", contexts)].join("\n\n");

const wireStateFor = (
  model: string,
  state: DecisionRequest["state"],
): DecisionRequest["state"] | string => {
  if (TEXT_STATE_MODELS.some((prefix) => model.startsWith(prefix))) {
    return stateAsText(state);
  }
  return state;
};

export { wireStateFor };

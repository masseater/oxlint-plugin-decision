import type { DecisionRule, SelectedNode } from "@r_masseater/oxlint-plugin-decision";
import { Match, Option, Predicate } from "effect";

type Select = NonNullable<DecisionRule["select"]>;

type NodeTest = Predicate.Predicate<SelectedNode>;

const isNode = (value: unknown): value is SelectedNode => Predicate.hasProperty(value, "type");

const childrenOf = (node: SelectedNode): readonly SelectedNode[] =>
  Object.entries(node)
    .filter(([key]) => key !== "parent")
    .flatMap(([, value]: readonly [string, unknown]) => [value].flat())
    .filter((value) => isNode(value));

const descendantsOf = (node: SelectedNode): readonly SelectedNode[] => [
  node,
  ...childrenOf(node).flatMap((child) => descendantsOf(child)),
];

const containing =
  (test: NodeTest): NodeTest =>
  (node) =>
    descendantsOf(node).some((found) => test(found));

const ofType =
  (...types: readonly string[]): NodeTest =>
  (node) =>
    types.includes(node.type);

const identifierOf = (node: SelectedNode): Option.Option<string> =>
  Match.value(node).pipe(
    Match.when({ type: "Identifier" }, (identifier) => Option.some(identifier.name)),
    Match.orElse(() => Option.none()),
  );

export { containing, identifierOf, ofType };
export type { NodeTest, Select };

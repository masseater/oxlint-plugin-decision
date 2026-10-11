import type { Context } from "@oxlint/plugins";
import { Option } from "effect";

import type { AstNode, DecisionRule, Target } from "./types.ts";

const HOLDERS: Readonly<Record<string, readonly ["init" | "value", "id" | "key"]>> = {
  VariableDeclarator: ["init", "id"],
  Property: ["value", "key"],
  MethodDefinition: ["value", "key"],
  PropertyDefinition: ["value", "key"],
};

const holderNameOf = (node: AstNode): Option.Option<AstNode> =>
  Option.fromNullishOr(node.parent).pipe(
    Option.flatMap((parent) =>
      Option.flatMap(Option.fromUndefinedOr(HOLDERS[parent.type]), ([held, name]) =>
        Option.filter(Option.fromNullishOr(parent[name]), () => parent[held] === node),
      ),
    ),
  );

const NAME_NODES = {
  function: (node: AstNode) =>
    Option.orElse(Option.fromNullishOr(node.id), () => holderNameOf(node)),
  call: (node: AstNode) => Option.fromUndefinedOr(node.callee),
  jsx: (node: AstNode) =>
    Option.flatMap(Option.fromNullishOr(node.openingElement), (opening) =>
      Option.fromUndefinedOr(opening.name),
    ),
  file: () => Option.none(),
} as const satisfies Readonly<Record<Target, (node: AstNode) => Option.Option<AstNode>>>;

const STATEFUL_FLAGS = /[gy]/u;

const nameProblemOf = ({
  id,
  target,
  nameMatches,
}: Pick<DecisionRule, "id" | "target" | "nameMatches">): Option.Option<string> =>
  Option.flatMap(Option.fromUndefinedOr(nameMatches), ({ flags }) => {
    if (target === "file") {
      return Option.some("nameMatches is not supported for file rules");
    }
    return Option.liftPredicate(
      `rule "${id}" has a nameMatches with the g or y flag, which makes repeated tests disagree`,
      () => STATEFUL_FLAGS.test(flags),
    );
  });

const isNamedMatch = (
  context: Context,
  node: AstNode,
  { target, nameMatches }: Pick<DecisionRule, "target" | "nameMatches">,
): boolean =>
  Option.match(Option.fromUndefinedOr(nameMatches), {
    onNone: () => true,
    onSome: (pattern) =>
      Option.exists(NAME_NODES[target](node), (name) =>
        pattern.test(context.sourceCode.getText(name)),
      ),
  });

export { isNamedMatch, nameProblemOf };

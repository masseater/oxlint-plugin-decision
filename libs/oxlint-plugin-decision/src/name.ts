import type { Context } from "@oxlint/plugins";
import { Match, Option } from "effect";

import type { DecisionRule, SelectedNode } from "./types.ts";

const none = (): Option.Option<SelectedNode> => Option.none();

const heldName = (node: SelectedNode): Option.Option<SelectedNode> =>
  Option.flatMap(Option.fromNullishOr(node.parent), (parent) =>
    Match.value(parent).pipe(
      Match.when({ type: "VariableDeclarator" }, (holder) =>
        Option.liftPredicate(holder.id, () => holder.init === node),
      ),
      Match.when(
        { type: Match.is("Property", "MethodDefinition", "PropertyDefinition") },
        (holder) => Option.liftPredicate(holder.key, () => holder.value === node),
      ),
      Match.orElse(none),
    ),
  );

const nameNodeOf = (node: SelectedNode): Option.Option<SelectedNode> =>
  Match.value(node).pipe(
    Match.when({ type: Match.is("FunctionDeclaration", "FunctionExpression") }, (fn) =>
      Option.orElse(Option.fromNullishOr(fn.id), () => heldName(fn)),
    ),
    Match.when({ type: "ArrowFunctionExpression" }, heldName),
    Match.when({ type: Match.is("CallExpression", "NewExpression") }, (call) =>
      Option.some(call.callee),
    ),
    Match.when({ type: "JSXElement" }, (element) => Option.some(element.openingElement.name)),
    Match.orElse(none),
  );

const nameOf = (node: SelectedNode, context: Context): string | undefined =>
  Option.getOrUndefined(
    Option.map(nameNodeOf(node), (name) => context.sourceCode.text.slice(name.start, name.end)),
  );

const isSelected = (context: Context, node: SelectedNode, { select }: DecisionRule): boolean =>
  Option.match(Option.fromUndefinedOr(select), {
    onNone: () => true,
    onSome: (selects) => selects(node, { name: nameOf(node, context), context }),
  });

export { isSelected };

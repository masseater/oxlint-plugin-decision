import type { SelectedNode } from "@r_masseater/oxlint-plugin-decision";
import { Array as Arr, Match, Option, Predicate } from "effect";

import { isCast } from "./ai-slop-select.ts";
import type { NodeTest } from "./ai-slop-select.ts";

const NOT_FIELDS: ReadonlySet<string> = new Set([
  "Literal",
  "TemplateLiteral",
  "ObjectExpression",
  "ArrayExpression",
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

const isField: NodeTest = (node) =>
  Match.value(node).pipe(
    Match.when(
      { type: "Property", shorthand: false, method: false, kind: "init" },
      (property) => !NOT_FIELDS.has(property.value.type),
    ),
    Match.orElse(() => false),
  );

const isFieldList: NodeTest = (node) =>
  Match.value(node).pipe(
    Match.when({ type: "ObjectExpression" }, (object) =>
      Arr.match(object.properties, {
        onEmpty: () => false,
        onNonEmpty: (properties) => properties.every((property) => isField(property)),
      }),
    ),
    Match.orElse(() => false),
  );

const holdsFieldList: NodeTest = (node) =>
  Match.value(node).pipe(
    Match.when({ type: "CallExpression" }, (call) =>
      call.arguments.some((argument) => isFieldList(argument)),
    ),
    Match.orElse(() => false),
  );

const namesType: NodeTest = (node) =>
  Match.value(node).pipe(
    Match.when({ type: "TSSatisfiesExpression" }, () => true),
    Match.when({ type: "VariableDeclarator" }, (declarator) =>
      Predicate.isNotNullish(declarator.id.typeAnnotation),
    ),
    Match.orElse(() => isCast(node)),
  );

const isDeclarator = (node: SelectedNode): boolean => node.type === "VariableDeclarator";

const holdersOf = (node: SelectedNode): readonly SelectedNode[] =>
  Arr.unfold(Option.fromNullishOr(node.parent), (current) =>
    current.pipe(
      Option.map(
        (holder) =>
          [
            holder,
            Option.filter(Option.fromNullishOr(holder.parent), () => !isDeclarator(holder)),
          ] as const,
      ),
    ),
  );

const isTiedToType: NodeTest = (node) => holdersOf(node).some((holder) => namesType(holder));

const spellsOutShape: NodeTest = Predicate.and(holdsFieldList, Predicate.not(isTiedToType));

export { spellsOutShape };

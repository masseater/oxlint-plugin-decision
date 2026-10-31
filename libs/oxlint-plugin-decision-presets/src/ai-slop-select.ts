import type { SelectMatch, SelectedNode } from "@r_masseater/oxlint-plugin-decision";
import { Array as Arr, Match, Option, Predicate } from "effect";

import { containing, identifierOf, ofType } from "./select.ts";
import type { NodeTest, Select } from "./select.ts";

const isPlaceholderValue = ofType(
  "Literal",
  "TemplateLiteral",
  "ArrayExpression",
  "ObjectExpression",
);

const isFallbackOperator: NodeTest = (node) =>
  Match.value(node).pipe(
    Match.when({ type: "LogicalExpression", operator: "??" }, () => true),
    Match.when({ type: "LogicalExpression", operator: "||" }, (logical) =>
      isPlaceholderValue(logical.right),
    ),
    Match.when({ type: "AssignmentExpression", operator: "??=" }, () => true),
    Match.when({ type: "AssignmentExpression", operator: "||=" }, () => true),
    Match.orElse(() => false),
  );

const isTypeofCheck: NodeTest = (node) =>
  Match.value(node).pipe(
    Match.when({ type: "UnaryExpression", operator: "typeof" }, () => true),
    Match.orElse(() => false),
  );

const isConstAssertion = (annotation: SelectedNode): boolean =>
  Match.value(annotation).pipe(
    Match.when(
      { type: "TSTypeReference", typeName: { type: "Identifier", name: "const" } },
      () => true,
    ),
    Match.orElse(() => false),
  );

const isCast: NodeTest = (node) =>
  Match.value(node).pipe(
    Match.when({ type: "TSAsExpression" }, (cast) => !isConstAssertion(cast.typeAnnotation)),
    Match.when({ type: "TSTypeAssertion" }, () => true),
    Match.when({ type: "TSNonNullExpression" }, () => true),
    Match.orElse(() => false),
  );

const bodyOf = (node: SelectedNode): Option.Option<SelectedNode> =>
  Match.value(node).pipe(
    Match.when({ type: "FunctionDeclaration" }, (fn) => Option.fromNullishOr(fn.body)),
    Match.when({ type: "FunctionExpression" }, (fn) => Option.fromNullishOr(fn.body)),
    Match.when({ type: "ArrowFunctionExpression" }, (fn) => Option.some(fn.body)),
    Match.orElse(() => Option.none()),
  );

const statementsOf = (body: SelectedNode): readonly SelectedNode[] =>
  Match.value(body).pipe(
    Match.when({ type: "BlockStatement" }, (block) => block.body),
    Match.orElse((expression) => [expression]),
  );

const ONE_STATEMENT = 1;

const isCall = ofType("CallExpression", "NewExpression");

const parentOf = (node: SelectedNode): Option.Option<SelectedNode> =>
  Option.fromNullishOr(node.parent);

const isArgument = (node: SelectedNode): boolean => Option.exists(parentOf(node), isCall);

const isOptionOfCall = (node: SelectedNode): boolean =>
  parentOf(node).pipe(
    Option.filter(ofType("Property")),
    Option.flatMap(parentOf),
    Option.filter(ofType("ObjectExpression")),
    Option.exists(isArgument),
  );

const isCallback: NodeTest = Predicate.or(isArgument, isOptionOfCall);

const isDeclared: NodeTest = Predicate.not(isCallback);

const isShort: NodeTest = (node) =>
  Option.exists(bodyOf(node), (body) => statementsOf(body).length <= ONE_STATEMENT);

const hasAtMostOneStatement: NodeTest = Predicate.and(isDeclared, isShort);

const expressionOf = (statement: SelectedNode): Option.Option<SelectedNode> =>
  Match.value(statement).pipe(
    Match.when({ type: "ReturnStatement" }, (returned) => Option.fromNullishOr(returned.argument)),
    Match.when({ type: "ExpressionStatement" }, (expression) => Option.some(expression.expression)),
    Match.orElse((other) => Option.some(other)),
  );

const awaitedOf = (expression: SelectedNode): SelectedNode =>
  Match.value(expression).pipe(
    Match.when({ type: "AwaitExpression" }, (awaited) => awaited.argument),
    Match.orElse((plain) => plain),
  );

const isForwardingStatement = (statements: readonly SelectedNode[]): boolean =>
  Option.exists(
    Option.flatMap(Arr.head(statements), expressionOf),
    (expression) => awaitedOf(expression).type === "CallExpression",
  );

const isSingleCall: NodeTest = (node) =>
  Option.exists(bodyOf(node), (body) => isForwardingStatement(statementsOf(body)));

const paramsOf = (node: SelectedNode): readonly SelectedNode[] =>
  Match.value(node).pipe(
    Match.when({ type: "FunctionDeclaration" }, (fn) => fn.params),
    Match.when({ type: "FunctionExpression" }, (fn) => fn.params),
    Match.when({ type: "ArrowFunctionExpression" }, (fn) => fn.params),
    Match.orElse(() => []),
  );

const nameOf = (node: SelectedNode): Option.Option<string> =>
  Match.value(node).pipe(
    Match.when({ type: "SpreadElement" }, (spread) => identifierOf(spread.argument)),
    Match.when({ type: "RestElement" }, (rest) => identifierOf(rest.argument)),
    Match.orElse((plain) => identifierOf(plain)),
  );

const argumentsOf = (node: SelectedNode): Option.Option<readonly SelectedNode[]> =>
  bodyOf(node).pipe(
    Option.flatMap((body) => Arr.head(statementsOf(body))),
    Option.flatMap(expressionOf),
    Option.map(awaitedOf),
    Option.flatMap((expression) =>
      Match.value(expression).pipe(
        Match.when({ type: "CallExpression" }, (call) => Option.some(call.arguments)),
        Match.orElse(() => Option.none()),
      ),
    ),
  );

const isForwardedArgument =
  (names: readonly string[]) =>
  (argument: SelectedNode): boolean =>
    argument.type === "Literal" || Option.exists(nameOf(argument), (name) => names.includes(name));

const passesParamsUnchanged: NodeTest = (node) => {
  const params = paramsOf(node).map((param) => nameOf(param));
  const names = Arr.getSomes(params);
  return (
    names.length === params.length &&
    Option.exists(argumentsOf(node), (passed) => {
      const passedNames = Arr.getSomes(passed.map((argument) => nameOf(argument)));
      return (
        passed.every((argument) => isForwardedArgument(names)(argument)) &&
        names.every((name) => passedNames.includes(name))
      );
    })
  );
};

const forwardsOneCall: NodeTest = Predicate.and(
  Predicate.and(hasAtMostOneStatement, isSingleCall),
  passesParamsUnchanged,
);

const declaredTypeOf = (param: SelectedNode): Option.Option<SelectedNode> =>
  Match.value(param).pipe(
    Match.when({ type: "AssignmentPattern" }, (assigned) => declaredTypeOf(assigned.left)),
    Match.when({ type: "TSParameterProperty" }, (property) => declaredTypeOf(property.parameter)),
    Match.when({ typeAnnotation: { type: "TSTypeAnnotation" } }, (typed) =>
      Option.some(typed.typeAnnotation.typeAnnotation),
    ),
    Match.orElse(() => Option.none()),
  );

const isOpenType = ofType("TSUnknownKeyword", "TSAnyKeyword");

const hasNarrowParameter: NodeTest = (node) =>
  paramsOf(node).some((param) => Option.exists(declaredTypeOf(param), Predicate.not(isOpenType)));

const typeParameterNamesOf = (node: SelectedNode): readonly string[] =>
  Match.value(node).pipe(
    Match.when({ typeParameters: { type: "TSTypeParameterDeclaration" } }, (generic) =>
      generic.typeParameters.params.map((parameter) => parameter.name.name),
    ),
    Match.orElse(() => []),
  );

const referencedNameOf = (type: SelectedNode): Option.Option<string> =>
  Match.value(type).pipe(
    Match.when({ type: "TSTypeReference", typeName: { type: "Identifier" } }, (reference) =>
      Option.some(reference.typeName.name),
    ),
    Match.orElse(() => Option.none()),
  );

const isGenericParameter = (node: SelectedNode, param: SelectedNode): boolean =>
  Option.exists(Option.flatMap(declaredTypeOf(param), referencedNameOf), (name) =>
    typeParameterNamesOf(node).includes(name),
  );

const returnedOf = (node: SelectedNode): Option.Option<SelectedNode> =>
  Option.flatMap(bodyOf(node), (body) =>
    Option.flatMap(Arr.head(statementsOf(body)), expressionOf),
  );

const returnedNameOf = (node: SelectedNode): Option.Option<string> =>
  Option.flatMap(returnedOf(node), identifierOf);

const returnsParameter = (node: SelectedNode, param: SelectedNode): boolean =>
  Option.exists(
    Option.all([returnedNameOf(node), identifierOf(param)]),
    ([returned, given]) => returned === given,
  );

const ONE_PARAMETER = 1;

const onlyParameterOf = (node: SelectedNode): Option.Option<SelectedNode> =>
  Option.liftPredicate(paramsOf(node), (params) => params.length === ONE_PARAMETER).pipe(
    Option.flatMap(Arr.head),
  );

const isGenericIdentity: NodeTest = (node) =>
  onlyParameterOf(node).pipe(
    Option.filter((param) => isGenericParameter(node, param)),
    Option.exists((param) => returnsParameter(node, param)),
  );

const mayBePlaceholder: NodeTest = Predicate.and(
  hasAtMostOneStatement,
  Predicate.not(isGenericIdentity),
);

const commentsIn = (node: SelectedNode, { context }: SelectMatch): readonly string[] => {
  const [start, end] = node.range;
  return context.sourceCode
    .getAllComments()
    .filter((comment) => comment.start >= start)
    .filter((comment) => comment.end <= end)
    .map((comment) => comment.value);
};

const hasCommentInside: Select = (node, match) =>
  Arr.isReadonlyArrayNonEmpty(commentsIn(node, match));

const SUPPRESSIONS = [
  "eslint-disable",
  "oxlint-disable",
  "@ts-ignore",
  "@ts-expect-error",
  "@ts-nocheck",
  "fallow-ignore",
];

const hasSuppression: Select = (node, match) =>
  commentsIn(node, match).some((comment) => SUPPRESSIONS.some((word) => comment.includes(word)));

const isGuard: NodeTest = Predicate.or(
  ofType("IfStatement", "ConditionalExpression", "ChainExpression", "TryStatement"),
  isTypeofCheck,
);

const hasGuard: NodeTest = Predicate.and(hasNarrowParameter, containing(isGuard));

const hasFallback: Select = containing(
  Predicate.or(isFallbackOperator, ofType("AssignmentPattern")),
);

const hasCast: Select = containing(isCast);

export {
  forwardsOneCall,
  mayBePlaceholder,
  isDeclared,
  hasCast,
  hasCommentInside,
  hasFallback,
  hasGuard,
  hasSuppression,
};

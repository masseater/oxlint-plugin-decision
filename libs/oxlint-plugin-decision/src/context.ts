import type { Context } from "@oxlint/plugins";
import { Array as Arr, Option } from "effect";

import { sourceLines } from "./request.ts";
import type { AstNode, EnclosingKind, RuleContext } from "./types.ts";

const DEFAULT_LINES = 5;
const FIRST_LINE = 1;

const ENCLOSING_TYPES: Readonly<Record<EnclosingKind, readonly string[]>> = {
  function: ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"],
  class: ["ClassDeclaration", "ClassExpression"],
  block: ["BlockStatement", "StaticBlock", "Program"],
};

const ancestorsOf = (node: AstNode): readonly AstNode[] =>
  Arr.unfold(Option.fromNullishOr(node.parent), (current) =>
    current.pipe(
      Option.map((ancestor) => [ancestor, Option.fromNullishOr(ancestor.parent)] as const),
    ),
  );

const enclosingText = (context: Context, node: AstNode, kind: EnclosingKind): string =>
  Arr.findFirst(ancestorsOf(node), (ancestor) =>
    ENCLOSING_TYPES[kind].includes(ancestor.type),
  ).pipe(
    Option.match({
      onNone: () => context.sourceCode.text,
      onSome: (ancestor) => context.sourceCode.getText(ancestor),
    }),
  );

const linesAround = (
  context: Context,
  node: AstNode,
  {
    before = DEFAULT_LINES,
    after = DEFAULT_LINES,
  }: { readonly before?: number; readonly after?: number },
): string => {
  const lines = sourceLines(context.sourceCode.text);
  const first = Math.max(FIRST_LINE, node.loc.start.line - before);
  const last = Math.min(lines.length, node.loc.end.line + after);
  return lines
    .slice(first - FIRST_LINE, last)
    .map((text, index) => `L${String(first + index)}| ${text}`)
    .join("\n");
};

const contextOf = (context: Context, node: AstNode, rule: RuleContext): Option.Option<string> => {
  if (rule.scope === "lines") {
    return Option.some(linesAround(context, node, rule));
  }
  if (rule.scope === "enclosing") {
    return Option.some(enclosingText(context, node, rule.kind));
  }
  return Option.liftPredicate(context.sourceCode.text, () => rule.scope === "file");
};

export { contextOf };

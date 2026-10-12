import type { Context } from "@oxlint/plugins";
import { Array as Arr, Option, Predicate, String as Str } from "effect";

import { snippetNodeFor } from "./options.ts";
import { sourceLines } from "./request.ts";
import type { AstNode, EnclosingKind, ResolvedRule, RuleContext } from "./types.ts";

const DEFAULT_LINES = 5;
const FIRST_LINE = 1;
const LAST = 1;
const END = 1;

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

const DECLARING_PARENTS: ReadonlySet<string> = new Set([
  "VariableDeclaration",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
]);

const declarationOf = (node: AstNode): AstNode =>
  Option.fromNullishOr(node.parent).pipe(
    Option.filter((parent) => DECLARING_PARENTS.has(parent.type)),
    Option.match({ onNone: () => node, onSome: declarationOf }),
  );

interface Span {
  readonly start: number;
  readonly end: number;
}

const leadingOf = (text: string, comments: readonly Span[], until: number): readonly Span[] =>
  Option.match(Arr.last(comments), {
    onNone: () => [],
    onSome: (last) => {
      if (Str.isNonEmpty(text.slice(last.end, until).trim())) {
        return [];
      }
      return [...leadingOf(text, Arr.dropRight(comments, LAST), last.start), last];
    },
  });

const commentedTextOf = (context: Context, node: AstNode): Option.Option<string> => {
  const { text } = context.sourceCode;
  const named = snippetNodeFor(node);
  const [start] = declarationOf(named).range;
  const before = context.sourceCode
    .getAllComments()
    .filter((comment) => comment.type !== "Shebang" && comment.end <= start);
  return Arr.match(leadingOf(text, before, start), {
    onEmpty: () => Option.none(),
    onNonEmpty: ([first]) => Option.some(text.slice(first.start, named.range[END])),
  });
};

const isCommented = ({ context: wanted }: ResolvedRule): boolean =>
  Predicate.isNotUndefined(wanted) && wanted.scope === "comment";

const commentedSnippetOf = (
  context: Context,
  node: AstNode,
  rule: ResolvedRule,
): Option.Option<string> =>
  Option.flatMap(Option.liftPredicate(rule, isCommented), () => commentedTextOf(context, node));

const lacksComment = (context: Context, node: AstNode, rule: ResolvedRule): boolean =>
  isCommented(rule) && Option.isNone(commentedTextOf(context, node));

const importsOf = (context: Context): string =>
  context.sourceCode.ast.body
    .filter((statement) => statement.type === "ImportDeclaration")
    .map((statement) => context.sourceCode.getText(statement))
    .join("\n");

const contextOf = (context: Context, node: AstNode, rule: RuleContext): Option.Option<string> => {
  if (rule.scope === "imports") {
    return Option.some(importsOf(context));
  }
  if (rule.scope === "lines") {
    return Option.some(linesAround(context, node, rule));
  }
  if (rule.scope === "enclosing") {
    return Option.some(enclosingText(context, node, rule.kind));
  }
  return Option.liftPredicate(context.sourceCode.text, () => rule.scope === "file");
};

export { commentedSnippetOf, contextOf, lacksComment };

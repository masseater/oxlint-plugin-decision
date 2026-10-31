import type { SelectedNode } from "@r_masseater/oxlint-plugin-decision";
import { Array as Arr, Match, Option, Predicate } from "effect";

import { containing, identifierOf, ofType } from "./select.ts";
import type { NodeTest, Select } from "./select.ts";

const WORD_STARTS: ReadonlySet<string> = new Set([
  "",
  ..."_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
]);

const startsWithWord =
  (word: string): Predicate.Predicate<string> =>
  (name) =>
    Predicate.and(
      (text: string) => text.startsWith(word),
      (text: string) => WORD_STARTS.has(text.charAt(word.length)),
    )(name);

const endsWith =
  (word: string): Predicate.Predicate<string> =>
  (name) =>
    name.endsWith(word);

interface NameWords {
  readonly prefixes: readonly string[];
  readonly suffixes?: readonly string[];
}

const namedLike = ({ prefixes, suffixes = [] }: NameWords): Select => {
  const matchers = [
    ...prefixes.map((word) => startsWithWord(word)),
    ...suffixes.map((word) => endsWith(word)),
  ];
  return (_node, { name }) =>
    Option.exists(Option.fromUndefinedOr(name), (found) =>
      matchers.some((matches) => matches(found)),
    );
};

const rootOf = (callee: SelectedNode): Option.Option<string> =>
  Match.value(callee).pipe(
    Match.when({ type: "MemberExpression", computed: false }, (member) => rootOf(member.object)),
    Match.orElse(identifierOf),
  );

const calleeOf = (node: SelectedNode): Option.Option<SelectedNode> =>
  Match.value(node).pipe(
    Match.when({ type: "CallExpression" }, (call) => Option.some(call.callee)),
    Match.orElse(() => Option.none()),
  );

const callingAny =
  (roots: readonly string[]): Select =>
  (node) =>
    Option.exists(Option.flatMap(calleeOf(node), rootOf), (root) => roots.includes(root));

const LOG_LEVELS: ReadonlySet<string> = new Set([
  "trace",
  "debug",
  "verbose",
  "info",
  "log",
  "warn",
  "warning",
  "error",
  "fatal",
]);

const lastNameOf = (node: SelectedNode): Option.Option<string> =>
  Match.value(node).pipe(
    Match.when({ type: "MemberExpression", computed: false }, (member) =>
      identifierOf(member.property),
    ),
    Match.orElse(identifierOf),
  );

const isLogger = (name: string): boolean =>
  Arr.some(["console", "log"], (word) => name.toLowerCase().includes(word));

interface LogCall {
  readonly level: Option.Option<string>;
  readonly logger: Option.Option<string>;
}

const logCallOf = (callee: SelectedNode): Option.Option<LogCall> =>
  Match.value(callee).pipe(
    Match.when({ type: "MemberExpression", computed: false }, (member) =>
      Option.some({ level: identifierOf(member.property), logger: lastNameOf(member.object) }),
    ),
    Match.orElse(() => Option.none()),
  );

const isLogCall: Select = (node) =>
  Option.exists(Option.flatMap(calleeOf(node), logCallOf), ({ level, logger }) =>
    Predicate.and(
      () => Option.exists(level, (found) => LOG_LEVELS.has(found)),
      () => Option.exists(logger, isLogger),
    )(node),
  );

const isCatchName = (name: SelectedNode): boolean =>
  Match.value(name).pipe(
    Match.when({ type: "Identifier" }, (identifier) => identifier.name.startsWith("catch")),
    Match.orElse(() => false),
  );

const isCatch: NodeTest = (node) =>
  Match.value(node).pipe(
    Match.when({ type: "CatchClause" }, () => true),
    Match.when({ type: "MemberExpression", computed: false }, (member) =>
      isCatchName(member.property),
    ),
    Match.when({ type: "Property", computed: false }, (property) => isCatchName(property.key)),
    Match.orElse(() => false),
  );

const hasCatch: Select = containing(isCatch);

const hasCallbackArgument: Select = (node) =>
  Match.value(node).pipe(
    Match.when({ type: "CallExpression" }, (call) =>
      call.arguments.some((argument) =>
        ofType("ArrowFunctionExpression", "FunctionExpression")(argument),
      ),
    ),
    Match.orElse(() => false),
  );

const isTestCall: Select = (node, match) =>
  [callingAny(["it", "test"]), hasCallbackArgument].every((select) => select(node, match));
const isDescribeCall = callingAny(["describe"]);

export { hasCatch, isDescribeCall, isLogCall, isTestCall, namedLike };
export type { NameWords };

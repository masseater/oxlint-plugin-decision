import type { DecisionRule, SelectedNode } from "@r_masseater/oxlint-plugin-decision";
import { Array as Arr, Match, Option, Predicate } from "effect";

type Select = NonNullable<DecisionRule["select"]>;

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

const noName = (): Option.Option<string> => Option.none();

const identifierName = (node: SelectedNode): Option.Option<string> =>
  Match.value(node).pipe(
    Match.when({ type: "Identifier" }, (identifier) => Option.some(identifier.name)),
    Match.orElse(noName),
  );

const rootOf = (callee: SelectedNode): Option.Option<string> =>
  Match.value(callee).pipe(
    Match.when({ type: "MemberExpression", computed: false }, (member) => rootOf(member.object)),
    Match.orElse(identifierName),
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
      identifierName(member.property),
    ),
    Match.orElse(identifierName),
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
      Option.some({ level: identifierName(member.property), logger: lastNameOf(member.object) }),
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

const isTestCall = callingAny(["it", "test"]);
const isDescribeCall = callingAny(["describe"]);

export { isDescribeCall, isLogCall, isTestCall, namedLike };
export type { NameWords, Select };

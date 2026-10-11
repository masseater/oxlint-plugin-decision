import type { Location } from "@oxlint/plugins";
import { Array as Arr, Option, Predicate, Result, Schema, String as Str } from "effect";

import { BOOLEAN_ANSWER, decodeRuleAnswer } from "./answer.ts";
import type {
  AstNode,
  DecisionOptions,
  DecisionProvider,
  DecisionRule,
  ModelRef,
  ModelSpec,
  ResolvedOptions,
  ResolvedRule,
  RuleAnswer,
  Target,
} from "./types.ts";

const PREFIX = "oxlint-plugin-decision";
const PROVIDER_SEPARATOR = "/";
const FIRST_LINE = 1;
const FIRST_COLUMN = 0;

const TARGET_NODE_TYPES = {
  function: ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"],
  call: ["CallExpression"],
  jsx: ["JSXElement"],
  file: ["Program"],
} as const satisfies Readonly<Record<Target, readonly string[]>>;

const NAMED_PARENTS = {
  VariableDeclarator: "init",
  Property: "value",
  MethodDefinition: "value",
  PropertyDefinition: "value",
} as const;

type NamedField = (typeof NAMED_PARENTS)[keyof typeof NAMED_PARENTS];

const isNamedParentType = (type: string): type is keyof typeof NAMED_PARENTS =>
  Object.hasOwn(NAMED_PARENTS, type);

const ANONYMOUS_FUNCTIONS: ReadonlySet<string> = new Set([
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

const holdsAsName = (parent: AstNode, node: AstNode): boolean => {
  if (!isNamedParentType(parent.type)) {
    return false;
  }
  const field: NamedField = NAMED_PARENTS[parent.type];
  return ANONYMOUS_FUNCTIONS.has(node.type) && parent[field] === node;
};

const snippetNodeFor = (node: AstNode): AstNode =>
  Option.fromNullishOr(node.parent).pipe(
    Option.filter((parent) => holdsAsName(parent, node)),
    Option.getOrElse((): AstNode => node),
  );

const DEFAULTS = {
  ci: "fail",
  timeoutMs: 10_000,
  maxMatchesPerFile: 25,
  maxSnippetChars: 4000,
  model: "openrouter/~typesafe/jev-latest",
  env: {},
  explain: false,
} as const satisfies Required<DecisionOptions>;

const isSelector = (input: unknown): input is DecisionRule["select"] => Predicate.isFunction(input);

const RULE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const ModelSpecSchema = Schema.Union([
  Schema.NonEmptyString,
  Schema.NonEmptyArray(Schema.NonEmptyString),
]);

const NONE = 0;
const ONE = 1;
const EVEN_ODDS = 0.5;

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(NONE));

const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(ONE));

const RuleId = Schema.NonEmptyString.check(
  Schema.isPattern(RULE_ID, { message: "id must be lowercase words joined by hyphens" }),
);

const Probability = Schema.Number.check(Schema.isBetween({ minimum: NONE, maximum: ONE }));

const LocationCutoff = Schema.Number.check(
  Schema.isBetween({ minimum: EVEN_ODDS, maximum: ONE, exclusiveMinimum: true }),
);

const RuleContextSchema = Schema.Union([
  Schema.Struct({ scope: Schema.Literals(["node", "file", "comment"]) }),
  Schema.Struct({
    scope: Schema.Literal("lines"),
    before: Schema.optionalKey(NonNegativeInt),
    after: Schema.optionalKey(NonNegativeInt),
  }),
  Schema.Struct({
    scope: Schema.Literal("enclosing"),
    kind: Schema.Literals(["function", "class", "block"]),
  }),
]);

const ExplainSetting = Schema.Union([Schema.Boolean, Schema.Literals(["text", "json"])]);

const OptionsSchema = Schema.Struct({
  ci: Schema.optionalKey(Schema.Literals(["skip", "fail"])),
  timeoutMs: Schema.optionalKey(PositiveInt),
  maxMatchesPerFile: Schema.optionalKey(PositiveInt),
  maxSnippetChars: Schema.optionalKey(PositiveInt),
  model: Schema.optionalKey(ModelSpecSchema),
  env: Schema.optionalKey(Schema.Record(Schema.NonEmptyString, Schema.NonEmptyString)),
  explain: Schema.optionalKey(ExplainSetting),
});

const RuleSchema = Schema.Struct({
  id: RuleId,
  target: Schema.Literals(["function", "call", "jsx", "file"]),
  question: Schema.NonEmptyString,
  cutoff: Probability,
  message: Schema.optionalKey(Schema.NonEmptyString),
  select: Schema.optionalKey(Schema.declare(isSelector)),
  location: Schema.optionalKey(
    Schema.Struct({ question: Schema.NonEmptyString, cutoff: LocationCutoff }),
  ),
  model: Schema.optionalKey(ModelSpecSchema),
  context: Schema.optionalKey(RuleContextSchema),
  answer: Schema.optionalKey(Schema.Unknown),
});

const STRICT = { onExcessProperty: "error" } as const;

const decodeOptions = Schema.decodeUnknownResult(OptionsSchema, STRICT);
const decodeRule = Schema.decodeUnknownResult(RuleSchema, STRICT);

class OptionsError extends Error {
  public constructor(message: string) {
    super(`${PREFIX}: ${message}`);
    this.name = "OptionsError";
  }
}

const modelIdsOf = (spec: ModelSpec): readonly string[] => Arr.dedupe(Arr.ensure(spec));

const splitModelId = (id: string): Option.Option<readonly [string, string]> => {
  const [provider = "", ...rest] = id.split(PROVIDER_SEPARATOR);
  const model = rest.join(PROVIDER_SEPARATOR);
  return Option.liftPredicate(
    [provider, model] as const,
    ([left, right]) => Str.isNonEmpty(left) && Str.isNonEmpty(right),
  );
};

const resolveModel = (
  id: string,
  providers: Readonly<Record<string, DecisionProvider>>,
): ModelRef =>
  splitModelId(id).pipe(
    Option.flatMap(([name, model]) =>
      Option.map(Option.fromUndefinedOr(providers[name]), (provider) => ({
        id,
        provider,
        model,
      })),
    ),
    Option.getOrThrowWith(
      () =>
        new OptionsError(
          `model "${id}" must be "<provider>/<model>" with a provider from: ${Object.keys(providers).join(", ")}`,
        ),
    ),
  );

const duplicateIdOf = (rules: readonly DecisionRule[]): Option.Option<string> => {
  const ids = rules.map(({ id }) => id);
  return Arr.findFirst(ids, (id, index) => ids.indexOf(id) !== index);
};

const answerOf = (rule: DecisionRule): RuleAnswer => {
  if (Predicate.isUndefined(rule.answer)) {
    return BOOLEAN_ANSWER;
  }
  return Result.getOrThrowWith(
    decodeRuleAnswer(rule.answer),
    (issue) => new OptionsError(`rule "${rule.id}" has an invalid answer: ${issue}`),
  );
};

type Decode<Value> = (input: unknown) => Result.Result<Value, Schema.SchemaError>;

const checked = <Value>(decode: Decode<Value>, input: unknown, what: string): Value =>
  Result.getOrThrowWith(
    decode(input),
    (issue) => new OptionsError(`invalid ${what}: ${issue.message}`),
  );

const checkRule = (rule: DecisionRule): DecisionRule => {
  checked(decodeRule, rule, `rule "${rule.id}"`);
  if (Predicate.isNotUndefined(rule.location) && rule.target !== "file") {
    throw new OptionsError("location is supported only for file rules");
  }
  answerOf(rule);
  return rule;
};

const checkRules = (rules: readonly DecisionRule[]): readonly DecisionRule[] => {
  if (!Arr.isReadonlyArrayNonEmpty(rules)) {
    throw new OptionsError("rules must list at least one rule");
  }
  Option.map(duplicateIdOf(rules), (duplicate) => {
    throw new OptionsError(`rule id "${duplicate}" is used more than once`);
  });
  return rules.map((rule) => checkRule(rule));
};

const resolveRule =
  (fallback: ModelSpec, providers: Readonly<Record<string, DecisionProvider>>) =>
  (rule: DecisionRule): ResolvedRule => ({
    ...rule,
    answer: answerOf(rule),
    models: modelIdsOf(rule.model ?? fallback).map((id) => resolveModel(id, providers)),
  });

interface Sources {
  readonly options: DecisionOptions;
  readonly settings?: unknown;
}

const settingsFrom = (settings: unknown): DecisionOptions => {
  if (Predicate.isUndefined(settings)) {
    return {};
  }
  return checked(decodeOptions, settings, "settings");
};

const resolveOptions = (
  { options, settings }: Sources,
  rules: readonly DecisionRule[],
  providers: Readonly<Record<string, DecisionProvider>>,
): ResolvedOptions => {
  const fromCode = checked(decodeOptions, options, "createDecisionPlugin options");
  const { model, ...merged } = { ...DEFAULTS, ...fromCode, ...settingsFrom(settings) };
  return {
    ci: merged.ci,
    timeoutMs: merged.timeoutMs,
    maxMatchesPerFile: merged.maxMatchesPerFile,
    maxSnippetChars: merged.maxSnippetChars,
    env: merged.env,
    explain: merged.explain,
    rules: checkRules(rules).map((rule) => resolveRule(model, providers)(rule)),
  };
};

const headOf = (text: string, line: number, column: number): Location => {
  const [first = ""] = text.split("\n", FIRST_LINE);
  return { start: { line, column }, end: { line, column: column + first.length } };
};

const REPORT_LOC = {
  function: (node: AstNode, text: string): Location =>
    headOf(text, node.loc.start.line, node.loc.start.column),
  call: (node: AstNode): Location => node.loc,
  jsx: (node: AstNode): Location =>
    Option.getOrElse(Option.fromNullishOr(node.openingElement), () => node).loc,
  file: (_node: AstNode, text: string): Location => headOf(text, FIRST_LINE, FIRST_COLUMN),
} as const satisfies Readonly<Record<Target, (node: AstNode, text: string) => Location>>;

export type { Decode, Sources };
export {
  checkRules,
  NAMED_PARENTS,
  OptionsError,
  PREFIX,
  REPORT_LOC,
  ModelSpecSchema,
  STRICT,
  TARGET_NODE_TYPES,
  checked,
  modelIdsOf,
  resolveModel,
  resolveOptions,
  snippetNodeFor,
};

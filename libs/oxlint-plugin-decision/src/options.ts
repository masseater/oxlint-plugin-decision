import type { Location, RuleOptionsSchema } from "@oxlint/plugins";
import { Array as Arr, Option, Predicate, String as Str } from "effect";

import type {
  AstNode,
  DecisionOptions,
  DecisionProvider,
  DecisionRule,
  ModelRef,
  ModelSpec,
  ResolvedOptions,
  ResolvedRule,
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
  ci: "skip",
  timeoutMs: 10_000,
  maxMatchesPerFile: 25,
  maxSnippetChars: 4000,
  model: "openrouter/~typesafe/jev-latest",
} as const satisfies Required<Omit<DecisionOptions, "rules">>;

const MODEL_SCHEMA = {
  oneOf: [
    { type: "string", minLength: 1 },
    { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
  ],
} satisfies RuleOptionsSchema;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ci: { enum: ["skip", "fail"] },
    timeoutMs: { type: "integer", minimum: 1 },
    maxMatchesPerFile: { type: "integer", minimum: 1 },
    maxSnippetChars: { type: "integer", minimum: 1 },
    model: MODEL_SCHEMA,
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "target", "question", "cutoff"],
        properties: {
          id: { type: "string", minLength: 1 },
          target: { enum: Object.keys(TARGET_NODE_TYPES) },
          question: { type: "string", minLength: 1 },
          location: {
            type: "object",
            additionalProperties: false,
            required: ["question", "cutoff"],
            properties: {
              question: { type: "string", minLength: 1 },
              cutoff: { type: "number", minimum: 0.5, exclusiveMinimum: true, maximum: 1 },
            },
          },
          cutoff: { type: "number", minimum: 0, maximum: 1 },
          model: MODEL_SCHEMA,
        },
      },
    },
  },
} satisfies RuleOptionsSchema;

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

const resolveRule =
  (fallback: ModelSpec, providers: Readonly<Record<string, DecisionProvider>>) =>
  (rule: DecisionRule): ResolvedRule => {
    if (Predicate.isNotUndefined(rule.location) && rule.target !== "file") {
      throw new OptionsError("location is supported only for file rules");
    }
    return {
      ...rule,
      models: modelIdsOf(rule.model ?? fallback).map((id) => resolveModel(id, providers)),
    };
  };

const resolveOptions = (
  options: DecisionOptions,
  codeRules: readonly DecisionRule[],
  providers: Readonly<Record<string, DecisionProvider>>,
): ResolvedOptions => {
  const rules = [...codeRules, ...(options.rules ?? [])];
  if (!Arr.isReadonlyArrayNonEmpty(rules)) {
    throw new OptionsError("options.rules must list at least one rule");
  }
  Option.map(duplicateIdOf(rules), (duplicate) => {
    throw new OptionsError(`rule id "${duplicate}" is used more than once`);
  });
  return {
    ci: options.ci ?? DEFAULTS.ci,
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    maxMatchesPerFile: options.maxMatchesPerFile ?? DEFAULTS.maxMatchesPerFile,
    maxSnippetChars: options.maxSnippetChars ?? DEFAULTS.maxSnippetChars,
    rules: rules.map((rule) => resolveRule(options.model ?? DEFAULTS.model, providers)(rule)),
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
  jsx: (node: AstNode): Location => Option.getOrElse(Option.fromNullishOr(node.openingElement), () => node).loc,
  file: (_node: AstNode, text: string): Location => headOf(text, FIRST_LINE, FIRST_COLUMN),
} as const satisfies Readonly<Record<Target, (node: AstNode, text: string) => Location>>;

export {
  DEFAULTS,
  NAMED_PARENTS,
  OptionsError,
  PREFIX,
  REPORT_LOC,
  SCHEMA,
  TARGET_NODE_TYPES,
  resolveOptions,
  snippetNodeFor,
};
export type { NamedField };

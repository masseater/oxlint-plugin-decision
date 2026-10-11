import type { Context, VisitorWithHooks } from "@oxlint/plugins";
import { Array as Arr, Option } from "effect";

import { OptionsError, REPORT_LOC, TARGET_NODE_TYPES, snippetNodeFor } from "./options.ts";
import { reportModel } from "./report.ts";
import { truncateSnippet } from "./request.ts";
import { envOf, failsInCi, warnOnce } from "./runtime.ts";
import type {
  AstNode,
  DecisionProvider,
  Match,
  ModelRef,
  ResolvedOptions,
  ResolvedRule,
} from "./types.ts";

interface FileState {
  readonly options: ResolvedOptions;
  readonly models: readonly ModelRef[];
  readonly matches: Match[];
  readonly dropped: string[];
}

interface Collected {
  readonly options: ResolvedOptions;
  readonly models: readonly ModelRef[];
  readonly matches: readonly Match[];
  readonly dropped: readonly string[];
}

type OptionsFor = (raw: unknown) => ResolvedOptions;

const NODE_TYPES: readonly string[] = Object.values(TARGET_NODE_TYPES).flat();

const raisedMissing = new Set<string>();

const missingEnvOf = (provider: DecisionProvider): readonly string[] =>
  provider.requiredEnv.filter((name) => Option.isNone(envOf(name)));

const isAvailable = (options: ResolvedOptions, { provider }: ModelRef): boolean => {
  const missingNames = missingEnvOf(provider);
  if (Arr.isReadonlyArrayEmpty(missingNames)) {
    return true;
  }
  const missing = missingNames.join(", ");
  if (!failsInCi(options)) {
    warnOnce(`missing:${provider.name}`, `${missing} is not set, skipping ${provider.name} models`);
  } else if (!raisedMissing.has(provider.name)) {
    raisedMissing.add(provider.name);
    throw new OptionsError(`${missing} is not set`);
  }
  return false;
};

const availableModels = (options: ResolvedOptions): readonly ModelRef[] =>
  [
    ...new Map(
      options.rules.flatMap((rule) => rule.models).map((model) => [model.id, model]),
    ).values(),
  ].filter((model) => isAvailable(options, model));

const rulesFor = (options: ResolvedOptions, type: string): readonly ResolvedRule[] =>
  options.rules.filter((rule) =>
    (TARGET_NODE_TYPES[rule.target] as readonly string[]).includes(type),
  );

const snippetOf = (context: Context, node: AstNode): string => {
  if (node.type === "Program") {
    return context.sourceCode.text;
  }
  return context.sourceCode.getText(node);
};

const namedSnippetOf = (context: Context, node: AstNode): string => {
  const named = snippetNodeFor(node);
  if (named === node) {
    return snippetOf(context, node);
  }
  return context.sourceCode.getText(named);
};

const matchOf = (
  context: Context,
  node: AstNode,
  { rule, options }: { readonly rule: ResolvedRule; readonly options: ResolvedOptions },
): Match => {
  const text = namedSnippetOf(context, node);
  return {
    rule,
    loc: REPORT_LOC[rule.target](node, snippetOf(context, node)),
    snippet: truncateSnippet(text, options.maxSnippetChars),
    truncated: text.length > options.maxSnippetChars,
  };
};

const finish = (context: Context, collected: Collected): void => {
  if (Arr.isReadonlyArrayNonEmpty(collected.dropped)) {
    const dropped = collected.dropped.length;
    warnOnce(
      `capped:${context.filename}`,
      `${String(collected.matches.length + dropped)} matches exceeded maxMatchesPerFile=${String(collected.options.maxMatchesPerFile)}, ${String(dropped)} not checked (${context.filename})`,
    );
  }
  const deadline = Date.now() + collected.options.timeoutMs;
  for (const model of collected.models) {
    const matches = collected.matches.filter(({ rule }) =>
      rule.models.some(({ id }) => id === model.id),
    );
    if (Arr.isReadonlyArrayNonEmpty(matches)) {
      reportModel({ context, options: collected.options, model, matches, deadline });
    }
  }
};

const startFile = (options: ResolvedOptions): Option.Option<FileState> => {
  const models = availableModels(options);
  if (Arr.isReadonlyArrayEmpty(models)) {
    return Option.none();
  }
  return Option.some({ options, models, matches: [], dropped: [] });
};

const visitorFor =
  (optionsFor: OptionsFor) =>
  (context: Context): VisitorWithHooks => {
    let file: Option.Option<FileState> = Option.none();

    const collect = (type: string, node: AstNode): void => {
      if (Option.isNone(file)) {
        return;
      }
      const state = file.value;
      for (const rule of rulesFor(state.options, type)) {
        if (state.matches.length >= state.options.maxMatchesPerFile) {
          state.dropped.push(rule.id);
        } else {
          state.matches.push(matchOf(context, node, { rule, options: state.options }));
        }
      }
    };

    return {
      ...Object.fromEntries(
        NODE_TYPES.map((type) => [
          type,
          (node: AstNode): void => {
            collect(type, node);
          },
        ]),
      ),
      Program: (node: AstNode): void => {
        const raw = Option.getOrUndefined(Arr.head(context.options));
        file = startFile(optionsFor(raw));
        collect("Program", node);
      },
      "Program:exit": (): void => {
        const done = file;
        file = Option.none();
        if (Option.isSome(done)) {
          finish(context, done.value);
        }
      },
    };
  };

export { visitorFor };

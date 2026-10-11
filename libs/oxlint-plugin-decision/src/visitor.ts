import type { Context, VisitorWithHooks } from "@oxlint/plugins";
import { Array as Arr, Option, Predicate } from "effect";

import { contextOf } from "./context.ts";
import { OptionsError, REPORT_LOC, TARGET_NODE_TYPES, snippetNodeFor } from "./options.ts";
import { reportModel } from "./report.ts";
import { truncateSnippet } from "./request.ts";
import { envNameOf, envOf, failsInCi, warnOnce } from "./runtime.ts";
import type {
  AstNode,
  DecisionProvider,
  Match,
  ModelRef,
  ResolvedOptions,
  ResolvedRule,
  Target,
} from "./types.ts";

interface Collected {
  readonly options: ResolvedOptions;
  readonly contexts: Readonly<Record<string, Context>>;
  readonly matches: readonly Match[];
  readonly dropped: readonly string[];
}

interface FileBatch extends Collected {
  readonly contexts: Record<string, Context>;
  readonly matches: Match[];
  readonly dropped: string[];
  exiting: boolean;
  exits: number;
}

interface RuleFile {
  readonly batch: FileBatch;
  readonly rule: ResolvedRule;
}

interface SharedFile {
  readonly join: (context: Context, id: string) => FileBatch;
  readonly leave: () => void;
}

type OptionsFor = (settings: Readonly<Record<string, unknown>>) => ResolvedOptions;

const raisedMissing = new Set<string>();

const missingEnvOf = (options: ResolvedOptions, provider: DecisionProvider): readonly string[] =>
  provider.requiredEnv
    .map((name) => envNameOf(options.env, name))
    .filter((name) => Option.isNone(envOf(name)));

const isAvailable = (options: ResolvedOptions, { provider }: ModelRef): boolean => {
  const missingNames = missingEnvOf(options, provider);
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

const availableModels = (batch: Collected): readonly ModelRef[] =>
  [
    ...new Map(
      batch.options.rules
        .filter((rule) => Object.hasOwn(batch.contexts, rule.id))
        .flatMap((rule) => rule.models)
        .map((model) => [model.id, model]),
    ).values(),
  ].filter((model) => isAvailable(batch.options, model));

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
  const surrounding = contextOf(context, node, rule.context ?? { scope: "node" });
  return {
    ...Option.match(surrounding, { onNone: () => ({}), onSome: (value) => ({ context: value }) }),
    rule,
    loc: REPORT_LOC[rule.target](node, snippetOf(context, node)),
    snippet: truncateSnippet(text, options.maxSnippetChars),
    truncated: text.length > options.maxSnippetChars,
  };
};

const contextOfRule = (batch: Collected, id: string): Context =>
  Option.getOrThrow(Option.fromUndefinedOr(batch.contexts[id]));

const warnDropped = (batch: Collected, filename: string): void => {
  if (Arr.isReadonlyArrayEmpty(batch.dropped)) {
    return;
  }
  const dropped = batch.dropped.length;
  warnOnce(
    `capped:${filename}`,
    `${String(batch.matches.length + dropped)} matches exceeded maxMatchesPerFile=${String(batch.options.maxMatchesPerFile)}, ${String(dropped)} not checked (${filename})`,
  );
};

const finish = (batch: Collected): void => {
  const [first] = Object.values(batch.contexts);
  if (Predicate.isUndefined(first)) {
    return;
  }
  const models = availableModels(batch);
  warnDropped(batch, first.filename);
  const deadline = Date.now() + batch.options.timeoutMs;
  for (const model of models) {
    const matches = batch.matches.filter(({ rule }) =>
      rule.models.some(({ id }) => id === model.id),
    );
    if (Arr.isReadonlyArrayNonEmpty(matches)) {
      reportModel({
        contextOf: (match) => contextOfRule(batch, match.rule.id),
        filename: first.filename,
        options: batch.options,
        model,
        matches,
        deadline,
      });
    }
  }
};

const sharedFile = (optionsFor: OptionsFor): SharedFile => {
  let current: Option.Option<FileBatch> = Option.none();
  const start = (context: Context): FileBatch => {
    const batch: FileBatch = {
      options: optionsFor(context.settings),
      contexts: {},
      matches: [],
      dropped: [],
      exiting: false,
      exits: 0,
    };
    current = Option.some(batch);
    return batch;
  };
  return {
    join: (context, id) => {
      const batch = Option.match(current, {
        onNone: () => start(context),
        onSome: (open) => {
          if (open.exiting) {
            return start(context);
          }
          return open;
        },
      });
      batch.contexts[id] = context;
      return batch;
    },
    leave: () => {
      if (Option.isNone(current)) {
        return;
      }
      const batch = current.value;
      batch.exits += 1;
      if (batch.exits >= Object.keys(batch.contexts).length) {
        current = Option.none();
      }
      if (!batch.exiting) {
        batch.exiting = true;
        finish(batch);
      }
    },
  };
};

const ruleIn = (batch: Collected, id: string): ResolvedRule =>
  Option.getOrThrow(Arr.findFirst(batch.options.rules, (rule) => rule.id === id));

const visitorFor =
  (shared: SharedFile, { id, target }: { readonly id: string; readonly target: Target }) =>
  (context: Context): VisitorWithHooks => {
    let file: Option.Option<RuleFile> = Option.none();

    const collect = (node: AstNode): void => {
      if (Option.isNone(file)) {
        return;
      }
      const { batch, rule } = file.value;
      if (batch.matches.length >= batch.options.maxMatchesPerFile) {
        batch.dropped.push(rule.id);
      } else {
        batch.matches.push(matchOf(context, node, { rule, options: batch.options }));
      }
    };

    const nodeTypes: readonly string[] = TARGET_NODE_TYPES[target];

    return {
      ...Object.fromEntries(
        nodeTypes.map((type) => [
          type,
          (node: AstNode): void => {
            collect(node);
          },
        ]),
      ),
      Program: (node: AstNode): void => {
        const batch = shared.join(context, id);
        file = Option.some({ batch, rule: ruleIn(batch, id) });
        if (target === "file") {
          collect(node);
        }
      },
      "Program:exit": (): void => {
        file = Option.none();
        shared.leave();
      },
    };
  };

export { sharedFile, visitorFor };
export type { Collected, FileBatch, OptionsFor, SharedFile };

import type { Plugin, RuleMeta } from "@oxlint/plugins";
import { Option } from "effect";

import { openRouter } from "./openrouter.ts";
import { DEFAULTS, PREFIX, SCHEMA, resolveOptions } from "./options.ts";
import type {
  DecisionOptions,
  DecisionPlugin,
  DecisionPluginSetup,
  DecisionProvider,
  ResolvedOptions,
} from "./types.ts";
import { visitorFor } from "./visitor.ts";

const META = {
  type: "problem",
  docs: {
    description:
      "Ask decision models a plain-English yes/no question about matched code and report when the yes-probability clears the rule's cutoff.",
  },
  schema: [SCHEMA],
  defaultOptions: [DEFAULTS],
  messages: {
    yes: "[{{id}}] {{model}} answered yes ({{score}} >= {{cutoff}}): {{question}}",
    unlocated: `${PREFIX}: {{reason}} while refining the location of [{{id}}]; the finding is reported at the file level`,
  },
} satisfies RuleMeta;

const isOptions = (raw: unknown): raw is DecisionOptions & object =>
  typeof raw === "object" && raw !== null;

const createDecisionPlugin = (setup: DecisionPluginSetup = {}): DecisionPlugin => {
  const providers: Readonly<Record<string, DecisionProvider>> = Object.fromEntries(
    [openRouter, ...(setup.providers ?? [])].map((provider) => [provider.name, provider]),
  );
  const resolved = new WeakMap<object, ResolvedOptions>();
  const resolve = (options: DecisionOptions): ResolvedOptions =>
    resolveOptions(options, setup.rules ?? [], providers);

  const optionsFor = (raw: unknown): ResolvedOptions => {
    if (!isOptions(raw)) {
      return resolve({});
    }
    return Option.getOrElse(Option.fromUndefinedOr(resolved.get(raw)), () => {
      const options = resolve(raw);
      resolved.set(raw, options);
      return options;
    });
  };

  return {
    meta: { name: setup.name ?? "decision" },
    rules: { ask: { meta: META, createOnce: visitorFor(optionsFor) } },
  } satisfies Plugin;
};

export { createDecisionPlugin };

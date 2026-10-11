import type { Plugin, RuleMeta } from "@oxlint/plugins";
import { Predicate } from "effect";

import { openRouter } from "./openrouter.ts";
import { PREFIX, checkRules, resolveOptions } from "./options.ts";
import type {
  DecisionOptions,
  DecisionPlugin,
  DecisionPluginSetup,
  DecisionProvider,
  DecisionRule,
  ResolvedOptions,
} from "./types.ts";
import { sharedFile, visitorFor } from "./visitor.ts";

const DEFAULT_NAME = "decision";
const NO_SETTINGS = "";

const metaOf = (rule: DecisionRule): RuleMeta => ({
  type: "problem",
  docs: { description: rule.question },
  schema: [],
  messages: {
    yes: "[{{id}}] {{model}} answered {{answer}} ({{score}} >= {{cutoff}}): {{question}}",
    unlocated: `${PREFIX}: {{reason}} while refining the location of [{{id}}]; the finding is reported at the file level`,
  },
});

const SETUP_ONLY: ReadonlySet<string> = new Set(["name", "rules", "providers"]);

const optionsOf = (setup: DecisionPluginSetup): DecisionOptions =>
  Object.fromEntries(Object.entries(setup).filter(([key]) => !SETUP_ONLY.has(key)));

const createDecisionPlugin = (setup: DecisionPluginSetup): DecisionPlugin => {
  const name = setup.name ?? DEFAULT_NAME;
  const providers: Readonly<Record<string, DecisionProvider>> = Object.fromEntries(
    [openRouter, ...(setup.providers ?? [])].map((provider) => [provider.name, provider]),
  );
  const rules = checkRules(setup.rules);
  const options = optionsOf(setup);
  const resolve = (settings: unknown): ResolvedOptions =>
    resolveOptions({ options, settings }, rules, providers);
  const resolved = new Map<string, ResolvedOptions>([[NO_SETTINGS, resolve(undefined)]]);
  const optionsFor = (settings: Readonly<Record<string, unknown>>): ResolvedOptions => {
    const own = settings[name];
    const key = Predicate.isUndefined(own) ? NO_SETTINGS : JSON.stringify(own);
    const cached = resolved.get(key);
    if (Predicate.isNotUndefined(cached)) {
      return cached;
    }
    const fresh = resolve(own);
    resolved.set(key, fresh);
    return fresh;
  };
  const shared = sharedFile(optionsFor);

  return {
    meta: { name },
    rules: Object.fromEntries(
      rules.map((rule) => [rule.id, { meta: metaOf(rule), createOnce: visitorFor(shared, rule) }]),
    ),
  } satisfies Plugin;
};

export { createDecisionPlugin };

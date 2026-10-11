import type { Plugin, RuleMeta } from "@oxlint/plugins";
import { Predicate } from "effect";

import { openRouter } from "./openrouter.ts";
import { PREFIX, checkRules, resolveOptions } from "./options.ts";
import { RULE_OPTIONS_SCHEMA, overrideRule } from "./override.ts";
import type {
  DecisionOptions,
  DecisionPlugin,
  DecisionPluginSetup,
  DecisionProvider,
  DecisionRule,
  ResolvedOptions,
  ResolvedRule,
} from "./types.ts";
import { sharedFile, visitorFor } from "./visitor.ts";

const DEFAULT_NAME = "decision";

const metaOf = (rule: DecisionRule): RuleMeta => ({
  type: "problem",
  docs: { description: rule.question },
  schema: RULE_OPTIONS_SCHEMA,
  messages: {
    yes: "[{{id}}] {{model}} answered {{answer}} ({{score}} >= {{cutoff}}): {{question}}",
    unlocated: `${PREFIX}: {{reason}} while refining the location of [{{id}}]; the finding is reported at the file level`,
  },
});

const SETUP_ONLY: ReadonlySet<string> = new Set(["name", "rules", "providers"]);

const optionsOf = (setup: DecisionPluginSetup): DecisionOptions =>
  Object.fromEntries(Object.entries(setup).filter(([key]) => !SETUP_ONLY.has(key)));

type Resolve = (settings: unknown) => ResolvedOptions;

const memoized = (resolve: Resolve): Resolve => {
  const resolved = new Map<string, ResolvedOptions>();
  return (settings) => {
    const key = JSON.stringify([settings]);
    const cached = resolved.get(key);
    if (Predicate.isNotUndefined(cached)) {
      return cached;
    }
    const fresh = resolve(settings);
    resolved.set(key, fresh);
    return fresh;
  };
};

const memoizedRules = (
  providers: Readonly<Record<string, DecisionProvider>>,
): ((rule: ResolvedRule, options: unknown) => ResolvedRule) => {
  const resolved = new WeakMap<ResolvedRule, Map<string, ResolvedRule>>();
  return (rule, options) => {
    const known = resolved.get(rule) ?? new Map<string, ResolvedRule>();
    resolved.set(rule, known);
    const key = JSON.stringify([options]);
    const cached = known.get(key);
    if (Predicate.isNotUndefined(cached)) {
      return cached;
    }
    const fresh = overrideRule(rule, options, providers);
    known.set(key, fresh);
    return fresh;
  };
};

const createDecisionPlugin = (setup: DecisionPluginSetup): DecisionPlugin => {
  const name = setup.name ?? DEFAULT_NAME;
  const providers: Readonly<Record<string, DecisionProvider>> = Object.fromEntries(
    [openRouter, ...(setup.providers ?? [])].map((provider) => [provider.name, provider]),
  );
  const rules = checkRules(setup.rules);
  const options = optionsOf(setup);
  const resolve = memoized((settings) => resolveOptions({ options, settings }, rules, providers));
  resolve({});
  const shared = sharedFile((settings) => resolve(settings[name]), memoizedRules(providers));

  return {
    meta: { name },
    rules: Object.fromEntries(
      rules.map((rule) => [rule.id, { meta: metaOf(rule), createOnce: visitorFor(shared, rule) }]),
    ),
  } satisfies Plugin;
};

export { createDecisionPlugin };

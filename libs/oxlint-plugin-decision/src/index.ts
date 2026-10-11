import { createDecisionPlugin } from "./plugin.ts";
import type { DecisionPlugin } from "./types.ts";

const plugin: DecisionPlugin = createDecisionPlugin();

export default plugin;
export { defineProvider, defineRule } from "./define.ts";
export { openRouter } from "./openrouter.ts";
export { createDecisionPlugin } from "./plugin.ts";
export type {
  ChoiceQuestion,
  CiBehavior,
  DecideInput,
  DecideResult,
  DecisionOptions,
  DecisionPlugin,
  DecisionPluginSetup,
  DecisionProvider,
  DecisionRequest,
  DecisionRule,
  ModelSpec,
  NoulQuestion,
  Question,
  RuleLocation,
  Target,
} from "./types.ts";

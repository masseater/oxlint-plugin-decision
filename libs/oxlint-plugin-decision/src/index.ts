import { createDecisionPlugin } from "./plugin.ts";
import type { DecisionPlugin } from "./types.ts";

const plugin: DecisionPlugin = createDecisionPlugin();

export default plugin;
export { defineDecisionRule, defineProvider } from "./define.ts";
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
  EnclosingKind,
  ModelSpec,
  NoulQuestion,
  Question,
  RuleAnswer,
  RuleContext,
  RuleLocation,
  Severity,
  Target,
} from "./types.ts";

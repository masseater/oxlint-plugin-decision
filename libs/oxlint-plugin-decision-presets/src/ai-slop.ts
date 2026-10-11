import { createDecisionPlugin } from "@r_masseater/oxlint-plugin-decision";
import type { DecisionPlugin } from "@r_masseater/oxlint-plugin-decision";

import { aiSlopRules } from "./ai-slop-rules.ts";

const plugin: DecisionPlugin = createDecisionPlugin({
  name: "decision-ai-slop",
  rules: aiSlopRules,
});

export default plugin;
export {
  aiSlopRules,
  castInsteadOfNarrowing,
  commentNarratesHistory,
  commentRestatesCode,
  defaultMasksMissingValue,
  docRestatesSignature,
  passThroughWrapper,
  placeholderImplementation,
  redundantGuard,
  reinventsBuiltin,
  suppressionInsteadOfFix,
} from "./ai-slop-rules.ts";

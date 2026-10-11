import { createDecisionPlugin, defineDecisionRule } from "oxlint-plugin-decision";
import { recommended } from "oxlint-plugin-decision-presets";

const noDirectDbInHandlers = defineDecisionRule({
  id: "no-direct-db-in-handlers",
  target: "function",
  question: "Is this an HTTP request handler that queries the database directly?",
  cutoff: 0.8,
});

export default createDecisionPlugin({
  name: "team",
  rules: [...recommended, noDirectDbInHandlers],
});

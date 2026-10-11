import type { DecisionProvider, DecisionRule } from "./types.ts";

const defineRule = <const Rule extends DecisionRule>(rule: Rule): Rule => rule;

const defineProvider = <const Provider extends DecisionProvider>(provider: Provider): Provider =>
  provider;

export { defineProvider, defineRule };

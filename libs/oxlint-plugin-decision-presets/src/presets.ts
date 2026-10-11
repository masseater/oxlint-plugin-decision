import type { DecisionRule } from "@r_masseater/oxlint-plugin-decision";

import {
  domainNaming,
  nameMatchesBehavior,
  noHardcodedSecrets,
  noPiiInLogs,
  noPromptInjection,
  noSwallowedErrors,
  preferSchemaValidation,
  staleComment,
  untrustedInputRisk,
} from "./rules.ts";

type Preset = readonly [DecisionRule, ...DecisionRule[]];

const recommended: Preset = [noPiiInLogs, noPromptInjection, noHardcodedSecrets];

const strict: Preset = [...recommended, nameMatchesBehavior, noSwallowedErrors, untrustedInputRisk];

const reviewOnly: Preset = [
  nameMatchesBehavior,
  staleComment,
  domainNaming,
  preferSchemaValidation,
];

const presets = { recommended, strict, reviewOnly } as const satisfies Readonly<
  Record<string, Preset>
>;

export { presets, recommended, reviewOnly, strict };
export type { Preset };

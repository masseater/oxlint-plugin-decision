import type { DecisionRule } from "@r_masseater/oxlint-plugin-decision";

import {
  nameMatchesBehavior,
  noHardcodedSecrets,
  noPiiInLogs,
  noPromptInjection,
  noSwallowedErrors,
  staleComment,
  untrustedInputRisk,
} from "./rules.ts";

type Preset = readonly [DecisionRule, ...DecisionRule[]];

const recommended: Preset = [noPiiInLogs, noPromptInjection, noHardcodedSecrets];

const strict: Preset = [...recommended, nameMatchesBehavior, noSwallowedErrors, untrustedInputRisk];

const reviewOnly: Preset = [nameMatchesBehavior, staleComment];

const presets = { recommended, strict, reviewOnly } as const satisfies Readonly<
  Record<string, Preset>
>;

export { presets, recommended, reviewOnly, strict };
export type { Preset };

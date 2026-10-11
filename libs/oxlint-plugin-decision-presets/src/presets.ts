import type { DecisionRule } from "@r_masseater/oxlint-plugin-decision";

import {
  catchHidesFailure,
  commentDescribesBlock,
  commentDescribesDeclaration,
  docErrorsMatchBody,
  errorMessageMatchesCondition,
  fnNamePromises,
  idempotentName,
  logLevelMatchesEvent,
  logMessageMatchesEvent,
  pureNameIsPure,
  safeNameIsSafe,
  varNameDescribesValue,
} from "./code-claims.ts";
import {
  domainNaming,
  nameMatchesBehavior,
  noHardcodedSecrets,
  noPiiInLogs,
  noPromptInjection,
  preferSchemaValidation,
  untrustedInputRisk,
} from "./rules.ts";
import {
  describeNamesSubject,
  snapshotOnlyBehaviourClaim,
  testMocksSubject,
  testNameDescribesCode,
  testNameVerifiesClaim,
} from "./test-claims.ts";

type Preset = readonly [DecisionRule, ...DecisionRule[]];

const recommended: Preset = [noPiiInLogs, noPromptInjection, noHardcodedSecrets];

const strict: Preset = [
  ...recommended,
  nameMatchesBehavior,
  untrustedInputRisk,
  pureNameIsPure,
  safeNameIsSafe,
  idempotentName,
  catchHidesFailure,
  testNameVerifiesClaim,
  testMocksSubject,
];

const reviewOnly: Preset = [
  domainNaming,
  preferSchemaValidation,
  fnNamePromises,
  commentDescribesDeclaration,
  commentDescribesBlock,
  docErrorsMatchBody,
  errorMessageMatchesCondition,
  logLevelMatchesEvent,
  logMessageMatchesEvent,
  varNameDescribesValue,
  describeNamesSubject,
  testNameDescribesCode,
  snapshotOnlyBehaviourClaim,
];

const presets = { recommended, strict, reviewOnly } as const satisfies Readonly<
  Record<string, Preset>
>;

export { presets, recommended, reviewOnly, strict };
export type { Preset };

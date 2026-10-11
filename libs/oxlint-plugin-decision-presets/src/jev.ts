import { createDecisionPlugin } from "@r_masseater/oxlint-plugin-decision";
import type { DecisionPlugin } from "@r_masseater/oxlint-plugin-decision";

import { jevCode, jevTests } from "./jev-rules.ts";

const jev = [...jevCode, ...jevTests] as const;

const plugin: DecisionPlugin = createDecisionPlugin({ name: "decision-jev", rules: jev });

export default plugin;
export { jev };
export {
  catchHidesFailure,
  commentDescribesBlock,
  commentDescribesDeclaration,
  describeNamesSubject,
  docErrorsMatchBody,
  errorMessageMatchesCondition,
  fnNamePromises,
  idempotentName,
  jevCode,
  jevTests,
  logLevelMatchesEvent,
  logMessageMatchesEvent,
  pureNameIsPure,
  safeNameIsSafe,
  snapshotOnlyBehaviourClaim,
  testMocksSubject,
  testNameDescribesCode,
  testNameVerifiesClaim,
  varNameDescribesValue,
} from "./jev-rules.ts";

import { defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";
import type { DecisionRule, RuleContext } from "@r_masseater/oxlint-plugin-decision";
import { Predicate } from "effect";

interface Judgement {
  readonly ask: string;
  readonly yes: string;
  readonly no: string;
  readonly note?: string | undefined;
}

interface ClaimRule extends Judgement {
  readonly id: string;
  readonly target?: "function" | "call";
  readonly cutoff: number;
  readonly select?: NonNullable<DecisionRule["select"]>;
  readonly context?: RuleContext;
}

const questionOf = ({ ask, yes, no, note }: Judgement): string =>
  [ask, `It is true when: ${yes}`, `It is false when: ${no}`, note]
    .filter((part) => Predicate.isNotUndefined(part))
    .join("\n\n");

const claimRule = ({ ask, yes, no, note, ...rule }: ClaimRule): DecisionRule =>
  defineDecisionRule({
    target: "function",
    ...rule,
    message: ask,
    question: questionOf({ ask, yes, no, note }),
  });

const COMMENT: RuleContext = { scope: "comment" };
const ENCLOSING_FUNCTION: RuleContext = { scope: "enclosing", kind: "function" };

export { COMMENT, ENCLOSING_FUNCTION, claimRule };
export type { ClaimRule, Judgement };

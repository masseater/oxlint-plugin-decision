import { defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";
import type { DecisionRule, RuleContext } from "@r_masseater/oxlint-plugin-decision";
import { Predicate } from "effect";

interface Judgement {
  readonly ask: string;
  readonly yes: string;
  readonly no: string;
  readonly note?: string | undefined;
}

interface ClaimRule extends Judgement, Pick<DecisionRule, "id" | "cutoff" | "select" | "context"> {
  readonly target?: Extract<DecisionRule["target"], "function" | "call">;
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

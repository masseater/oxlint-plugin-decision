import type { Context, Location } from "@oxlint/plugins";
import { Option } from "effect";

import { fetchVerdicts, locateMatch } from "./locate.ts";
import type { Asking, Located } from "./locate.ts";
import { OptionsError } from "./options.ts";
import { buildRequest, refAt } from "./request.ts";
import { failsInCi, warnOnce } from "./runtime.ts";
import type { DecisionRequest, Match, ModelRef, ResolvedOptions, Verdicts } from "./types.ts";

interface ModelPass {
  readonly context: Context;
  readonly options: ResolvedOptions;
  readonly model: ModelRef;
  readonly matches: readonly Match[];
  readonly deadline: number;
}

interface Failure {
  readonly id: string;
  readonly loc: Location;
  readonly reason: string;
}

interface Answered {
  readonly asking: Asking;
  readonly verdicts: Verdicts;
  readonly request: DecisionRequest;
}

const DECIMALS = 2;
const NO_SCORE = 0;

const degrade = (pass: ModelPass, reason: string): void => {
  if (failsInCi(pass.options)) {
    throw new OptionsError(`${reason} (${pass.context.filename})`);
  }
  warnOnce(reason, `${reason} (${pass.context.filename})`);
};

const reportFailure = (pass: ModelPass, failure: Failure): void => {
  if (failsInCi(pass.options)) {
    pass.context.report({
      loc: failure.loc,
      messageId: "unlocated",
      data: { id: failure.id, reason: failure.reason },
    });
    return;
  }
  warnOnce(failure.reason, `${failure.reason} (${pass.context.filename})`);
};

const locate = (
  answered: Answered,
  match: Match,
  { ref, failed }: { readonly ref: string; readonly failed: boolean },
): Located => {
  if (failed) {
    return { loc: match.loc, failure: Option.none() };
  }
  return locateMatch(answered.asking, match, { ...answered, ref });
};

const reportMatches = (pass: ModelPass, answered: Answered): Option.Option<Failure> => {
  let failure: Option.Option<Failure> = Option.none();
  for (const [index, match] of pass.matches.entries()) {
    const ref = refAt(index);
    const score = answered.verdicts.scores[ref] ?? NO_SCORE;
    if (score >= match.rule.cutoff) {
      const located = locate(answered, match, { ref, failed: Option.isSome(failure) });
      failure = Option.orElse(failure, () =>
        located.failure.pipe(
          Option.map((reason) => ({ id: match.rule.id, loc: match.loc, reason })),
        ),
      );
      pass.context.report({
        loc: located.loc,
        messageId: "yes",
        data: {
          id: match.rule.id,
          model: `${pass.model.provider.name}/${answered.verdicts.model}`,
          score: score.toFixed(DECIMALS),
          cutoff: match.rule.cutoff.toFixed(DECIMALS),
          question: match.rule.question,
        },
      });
    }
  }
  return failure;
};

const reportModel = (pass: ModelPass): void => {
  const asking: Asking = { model: pass.model, deadline: pass.deadline };
  const request = buildRequest(pass.model.model, pass.matches);
  const result = fetchVerdicts(asking, request);
  if (!result.ok) {
    degrade(pass, result.reason);
    return;
  }
  const failure = reportMatches(pass, { asking, verdicts: result.verdicts, request });
  if (Option.isSome(failure)) {
    reportFailure(pass, failure.value);
  }
};

export { reportModel };

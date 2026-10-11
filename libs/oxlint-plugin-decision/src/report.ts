import type { Context, Location } from "@oxlint/plugins";
import { Option } from "effect";

import { isReported } from "./answer.ts";
import { fetchVerdicts, locateMatch } from "./locate.ts";
import type { Asking, Located } from "./locate.ts";
import { OptionsError } from "./options.ts";
import { buildRequest, refAt } from "./request.ts";
import { failsInCi, warnOnce } from "./runtime.ts";
import type { DecisionRequest, Match, ModelRef, ResolvedOptions, Verdicts } from "./types.ts";

interface ModelPass {
  readonly contextOf: (match: Match) => Context;
  readonly filename: string;
  readonly options: ResolvedOptions;
  readonly model: ModelRef;
  readonly matches: readonly Match[];
  readonly deadline: number;
}

interface Failure {
  readonly match: Match;
  readonly loc: Location;
  readonly reason: string;
}

interface Answered {
  readonly asking: Asking;
  readonly verdicts: Verdicts;
  readonly request: DecisionRequest;
}

const DECIMALS = 2;

const degrade = (pass: ModelPass, reason: string): void => {
  if (failsInCi(pass.options)) {
    throw new OptionsError(`${reason} (${pass.filename})`);
  }
  warnOnce(reason, `${reason} (${pass.filename})`);
};

const reportFailure = (pass: ModelPass, failure: Failure): void => {
  if (failsInCi(pass.options)) {
    pass.contextOf(failure.match).report({
      loc: failure.loc,
      messageId: "unlocated",
      data: { id: failure.match.rule.id, reason: failure.reason },
    });
    return;
  }
  warnOnce(failure.reason, `${failure.reason} (${pass.filename})`);
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
    const verdict = Option.fromUndefinedOr(answered.verdicts.results[ref]);
    if (Option.isSome(verdict) && isReported(match.rule, verdict.value)) {
      const located = locate(answered, match, { ref, failed: Option.isSome(failure) });
      failure = Option.orElse(failure, () =>
        located.failure.pipe(Option.map((reason) => ({ match, loc: match.loc, reason }))),
      );
      pass.contextOf(match).report({
        loc: located.loc,
        messageId: "yes",
        data: {
          id: match.rule.id,
          model: `${pass.model.provider.name}/${answered.verdicts.model}`,
          answer: verdict.value.answer,
          score: verdict.value.probability.toFixed(DECIMALS),
          cutoff: match.rule.cutoff.toFixed(DECIMALS),
          question: match.rule.question,
        },
      });
    }
  }
  return failure;
};

const reportModel = (pass: ModelPass): void => {
  const asking: Asking = { model: pass.model, deadline: pass.deadline, env: pass.options.env };
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
export type { ModelPass };

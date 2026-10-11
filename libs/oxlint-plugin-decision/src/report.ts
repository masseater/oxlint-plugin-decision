import type { Context, Location } from "@oxlint/plugins";
import { Array as Arr, Option } from "effect";

import { isReported } from "./answer.ts";
import { explainerFor } from "./explain.ts";
import type { ExplainPass, Explainer, Outcome, Placed } from "./explain.ts";
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
  readonly cached: boolean | undefined;
  readonly explainer: Explainer;
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

const outcomeOf = (answered: Answered, match: Match, ref: string): Outcome => {
  const verdict = Option.fromUndefinedOr(answered.verdicts.results[ref]);
  return {
    served: `${answered.asking.model.provider.name}/${answered.verdicts.model}`,
    cached: answered.cached,
    answers: answered.verdicts.answers,
    verdict,
    reported: Option.exists(verdict, (found) => isReported(match.rule, found)),
  };
};

const reportMatch = (
  pass: ModelPass,
  answered: Answered,
  { match, ref, failed }: { readonly match: Match; readonly ref: string; readonly failed: boolean },
): Option.Option<string> => {
  const outcome = outcomeOf(answered, match, ref);
  const { verdict } = outcome;
  if (!outcome.reported || Option.isNone(verdict)) {
    answered.explainer.outcome(match, { ref, loc: match.loc }, outcome);
    return Option.none();
  }
  const located = locate(answered, match, { ref, failed });
  const at: Placed = { ref, loc: located.loc };
  answered.explainer.outcome(match, at, outcome);
  pass.contextOf(match).report({
    loc: located.loc,
    messageId: "yes",
    data: {
      id: match.rule.id,
      model: `${pass.model.provider.name}/${answered.verdicts.model}`,
      answer: verdict.value.answer,
      score: verdict.value.probability.toFixed(DECIMALS),
      cutoff: match.rule.cutoff.toFixed(DECIMALS),
      question: match.rule.message ?? match.rule.question,
    },
  });
  return located.failure;
};

const reportMatches = (pass: ModelPass, answered: Answered): Option.Option<Failure> => {
  let failure: Option.Option<Failure> = Option.none();
  for (const [index, match] of pass.matches.entries()) {
    const located = reportMatch(pass, answered, {
      match,
      ref: refAt(index),
      failed: Option.isSome(failure),
    });
    failure = Option.orElse(failure, () =>
      located.pipe(Option.map((reason) => ({ match, loc: match.loc, reason }))),
    );
  }
  return failure;
};

const explainPassOf = (pass: ModelPass, request: DecisionRequest): ExplainPass => ({
  setting: pass.options.explain,
  cwd: Option.match(Arr.head(pass.matches), {
    onNone: () => "",
    onSome: (match) => pass.contextOf(match).cwd,
  }),
  filename: pass.filename,
  model: pass.model.id,
  request,
});

const explainerOf = (pass: ModelPass, request: DecisionRequest): Explainer =>
  explainerFor(explainPassOf(pass, request));

const reportModel = (pass: ModelPass): void => {
  const asking: Asking = { model: pass.model, deadline: pass.deadline, env: pass.options.env };
  const request = buildRequest(pass.model.model, pass.matches);
  const explainer = explainerOf(pass, request);
  const result = fetchVerdicts(asking, request);
  if (!result.ok) {
    explainer.failure(pass.matches, result.reason);
    degrade(pass, result.reason);
    return;
  }
  Option.map(reportMatches(pass, { ...result, asking, request, explainer }), (failure) => {
    reportFailure(pass, failure);
  });
};

export { reportModel };
export type { ModelPass };

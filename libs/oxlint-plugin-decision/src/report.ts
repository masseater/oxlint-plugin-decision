import type { Context, Location } from "@oxlint/plugins";
import { Array as Arr, Boolean as Bool, Option } from "effect";

import { isReported } from "./answer.ts";
import { explainerFor } from "./explain.ts";
import type { ExplainPass, Explainer, Outcome, Placed } from "./explain.ts";
import { inputOf, locateMatch, verdictsOf } from "./locate.ts";
import type { Asking, Located } from "./locate.ts";
import { OptionsError } from "./options.ts";
import { buildRequest, refAt } from "./request.ts";
import { failsInCi, warnOnce } from "./runtime.ts";
import type {
  DecideResult,
  DecisionProvider,
  DecisionRequest,
  Match,
  ModelRef,
  ResolvedOptions,
  Verdicts,
} from "./types.ts";

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

const explainPassOf = (
  pass: ModelPass,
  { request, durationMs }: Pick<ExplainPass, "request" | "durationMs">,
): ExplainPass => ({
  setting: pass.options.explain,
  cwd: Option.match(Arr.head(pass.matches), {
    onNone: () => "",
    onSome: (match) => pass.contextOf(match).cwd,
  }),
  filename: pass.filename,
  model: pass.model.id,
  request,
  durationMs,
});

const explainerOf = (
  pass: ModelPass,
  timed: Pick<ExplainPass, "request" | "durationMs">,
): Explainer => explainerFor(explainPassOf(pass, timed));

interface Prepared {
  readonly pass: ModelPass;
  readonly asking: Asking;
  readonly request: DecisionRequest;
}

const prepare = (pass: ModelPass): Prepared => ({
  pass,
  asking: { model: pass.model, deadline: pass.deadline, env: pass.options.env },
  request: buildRequest(pass.model.model, pass.matches),
});

const reportAnswer = (
  { pass, asking, request }: Prepared,
  { decided, durationMs }: { readonly decided: DecideResult; readonly durationMs: number },
): void => {
  const explainer = explainerOf(pass, { request, durationMs });
  const result = verdictsOf(decided, request);
  if (!result.ok) {
    explainer.failure(pass.matches, result.reason);
    degrade(pass, result.reason);
    return;
  }
  Option.map(reportMatches(pass, { ...result, asking, request, explainer }), (failure) => {
    reportFailure(pass, failure);
  });
};

const decideWith = (
  provider: DecisionProvider,
  prepared: readonly Prepared[],
): readonly DecideResult[] => {
  const inputs = prepared.map(({ asking, request }) => inputOf(asking, request));
  return Option.match(Option.fromUndefinedOr(provider.decideAll), {
    onNone: () => inputs.map((input) => provider.decide(input)),
    onSome: (decideAll) => decideAll(inputs),
  });
};

const reportProvider = (prepared: Arr.NonEmptyReadonlyArray<Prepared>): void => {
  const { provider } = Arr.headNonEmpty(prepared).pass.model;
  const started = performance.now();
  const results = decideWith(provider, prepared);
  const durationMs = Math.round(performance.now() - started);
  const answers = Bool.match(results.length === prepared.length, {
    onTrue: () => results,
    onFalse: () =>
      prepared.map((): DecideResult => ({
        ok: false,
        reason: `provider ${provider.name} returned ${String(results.length)} results for ${String(prepared.length)} requests`,
      })),
  });
  for (const [one, decided] of Arr.zip(prepared, answers)) {
    reportAnswer(one, { decided, durationMs });
  }
};

const reportModels = (passes: readonly ModelPass[]): void => {
  const byProvider = Arr.groupBy(
    passes.map((pass) => prepare(pass)),
    ({ pass }) => pass.model.provider.name,
  );
  for (const prepared of Object.values(byProvider)) {
    reportProvider(prepared);
  }
};

export { reportModels };
export type { ModelPass };

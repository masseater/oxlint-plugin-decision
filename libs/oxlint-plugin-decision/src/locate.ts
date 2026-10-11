import type { Location } from "@oxlint/plugins";
import { Effect, Option } from "effect";

import {
  locates,
  locationCandidates,
  locationOfLine,
  locationQuestion,
  locationRefOf,
  parseVerdicts,
  selectedLocation,
} from "./request.ts";
import type { LocatedMatch } from "./request.ts";
import { messageOf, runOrElse } from "./runtime.ts";
import type { DecisionRequest, LineRange, Match, ModelRef, Verdicts } from "./types.ts";

type VerdictResult =
  | { readonly ok: true; readonly verdicts: Verdicts }
  | { readonly ok: false; readonly reason: string };

interface Located {
  readonly loc: Location;
  readonly failure: Option.Option<string>;
}

interface Asking {
  readonly model: ModelRef;
  readonly deadline: number;
}

interface Refinement {
  readonly asking: Asking;
  readonly match: Match & LocatedMatch;
  readonly ref: string;
  readonly state: DecisionRequest["state"];
}

const MINIMUM_TIMEOUT_MS = 1;

const remainingMs = (deadline: number): number =>
  Math.max(MINIMUM_TIMEOUT_MS, deadline - Date.now());

const fetchVerdicts = (asking: Asking, request: DecisionRequest): VerdictResult => {
  const result = asking.model.provider.decide({
    request,
    timeoutMs: remainingMs(asking.deadline),
  });
  if (!result.ok) {
    return result;
  }
  return runOrElse(
    Effect.sync((): VerdictResult => ({
      ok: true,
      verdicts: parseVerdicts(result.response, request),
    })),
    (cause) => ({ ok: false, reason: messageOf(cause) }),
  );
};

const isRange = (location: Option.Option<LineRange>): location is Option.Some<LineRange> =>
  Option.exists(location, ({ start, end }) => start !== end);

const refineOnce = (
  { asking, match, ref, state }: Refinement,
  within: LineRange,
): VerdictResult & { readonly next?: Option.Option<LineRange> } => {
  const questionId = locationRefOf(ref);
  const candidates = locationCandidates(match.snippet, within);
  const refined = fetchVerdicts(asking, {
    model: asking.model.model,
    state,
    questions: { [questionId]: locationQuestion(match, ref, candidates) },
  });
  if (!refined.ok) {
    return refined;
  }
  return {
    ...refined,
    next: selectedLocation(
      refined.verdicts.answers[questionId],
      candidates,
      match.rule.location.cutoff,
    ),
  };
};

const refine = (refinement: Refinement, first: Option.Option<LineRange>): Located => {
  let location = first;
  while (isRange(location)) {
    const step = refineOnce(refinement, location.value);
    if (!step.ok) {
      return { loc: refinement.match.loc, failure: Option.some(step.reason) };
    }
    location = step.next ?? Option.none();
  }
  return {
    loc: Option.match(location, {
      onNone: () => refinement.match.loc,
      onSome: ({ start }) => locationOfLine(refinement.match.snippet, start),
    }),
    failure: Option.none(),
  };
};

const locateMatch = (
  asking: Asking,
  match: Match,
  {
    ref,
    verdicts,
    request,
  }: { readonly ref: string; readonly verdicts: Verdicts; readonly request: DecisionRequest },
): Located => {
  if (!locates(match)) {
    return { loc: match.loc, failure: Option.none() };
  }
  const first = selectedLocation(
    verdicts.answers[locationRefOf(ref)],
    locationCandidates(match.snippet),
    match.rule.location.cutoff,
  );
  return refine({ asking, match, ref, state: request.state }, first);
};

export { fetchVerdicts, locateMatch };
export type { Asking, Located, VerdictResult };

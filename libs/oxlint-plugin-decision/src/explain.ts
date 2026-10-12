import type { Location } from "@oxlint/plugins";
import {
  Array as Arr,
  Boolean as Bool,
  Console,
  Effect,
  Function as Fn,
  Match,
  Option,
  Predicate,
  String as Str,
} from "effect";

import { PREFIX } from "./options.ts";
import { refAt } from "./request.ts";
import { envOf } from "./runtime.ts";
import type {
  Answer,
  Answers,
  DecisionRequest,
  ExplainSetting,
  Match as RuleMatch,
  Question,
  Verdict,
} from "./types.ts";
import { wireRequestsFor } from "./wire.ts";
import type { WireRequest } from "./wire.ts";

type ExplainMode = "off" | "text" | "json";

const EXPLAIN_ENV = "OXLINT_DECISION_EXPLAIN";
const OFF_VALUES: ReadonlySet<string> = new Set(["0", "false", "off", "no"]);
const STATE_HEAD_CHARS = 60;
const DECIMALS = 2;
const OPTION_SEPARATOR = "__";
const FIRST = 1;
const START = 0;
const COLUMN_BASE = 1;

interface ExplainQuestion {
  readonly id: string;
  readonly question: string;
  readonly probabilities: Readonly<Record<string, number>>;
}

interface Explanation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: string;
  readonly model: string;
  readonly served?: string;
  readonly cutoff: number;
  readonly cached?: boolean;
  readonly state: { readonly chars: number; readonly head: string };
  readonly questions: readonly ExplainQuestion[];
  readonly verdict?: Verdict;
  readonly reported: boolean;
  readonly error?: string;
}

interface Outcome {
  readonly served: string;
  readonly answers: Answers;
  readonly cached: boolean | undefined;
  readonly verdict: Option.Option<Verdict>;
  readonly reported: boolean;
}

interface Explainer {
  readonly outcome: (match: RuleMatch, at: Placed, outcome: Outcome) => void;
  readonly failure: (matches: readonly RuleMatch[], reason: string) => void;
}

interface Placed {
  readonly ref: string;
  readonly loc: Location;
}

interface ExplainPass {
  readonly setting: ExplainSetting;
  readonly cwd: string;
  readonly filename: string;
  readonly model: string;
  readonly request: DecisionRequest;
}

const SEPARATOR = /^[/\\]/u;

const relativeTo = (root: string, filename: string): string =>
  Bool.match(
    Str.isNonEmpty(root) &&
      filename.startsWith(root) &&
      SEPARATOR.test(filename.slice(root.length)),
    {
      onTrue: () => filename.slice(root.length + FIRST),
      onFalse: () => filename,
    },
  );

const fromSetting = (setting: ExplainSetting): ExplainMode =>
  Match.value(setting).pipe(
    Match.when("json", (): ExplainMode => "json"),
    Match.when(true, (): ExplainMode => "text"),
    Match.when("text", (): ExplainMode => "text"),
    Match.orElse((): ExplainMode => "off"),
  );

const fromEnv = (value: string): ExplainMode =>
  Match.value(value.toLowerCase()).pipe(
    Match.when("json", (): ExplainMode => "json"),
    Match.when(
      (lower) => OFF_VALUES.has(lower),
      (): ExplainMode => "off",
    ),
    Match.orElse((): ExplainMode => "text"),
  );

const explainModeOf = (setting: ExplainSetting): ExplainMode =>
  Option.match(envOf(EXPLAIN_ENV), { onNone: () => fromSetting(setting), onSome: fromEnv });

const probabilitiesIn = (answer: Answer): Option.Option<Readonly<Record<string, number>>> => {
  if (answer.type === "noul") {
    return Option.some({ yes: answer.noul });
  }
  if (answer.type === "UNKNOWN") {
    return Option.none();
  }
  return Option.fromUndefinedOr(answer.probabilities);
};

const probabilitiesOf = (answer: Answer | undefined): Readonly<Record<string, number>> =>
  Option.fromUndefinedOr(answer).pipe(
    Option.flatMap(probabilitiesIn),
    Option.getOrElse(() => ({})),
  );

const asksAbout = (ref: string, id: string): boolean =>
  id.split(OPTION_SEPARATOR, FIRST).includes(ref);

const sentFor = (
  sent: readonly WireRequest[],
  ref: string,
): readonly (readonly [string, Question])[] =>
  sent.flatMap((wire) => Object.entries(wire.questions).filter(([id]) => asksAbout(ref, id)));

const stateTextOf = (sent: readonly WireRequest[], ref: string, snippet: string): string =>
  Arr.findFirst(sent, (wire) => Object.keys(wire.questions).some((id) => asksAbout(ref, id))).pipe(
    Option.map(({ state }) => state),
    Option.filter(Predicate.isString),
    Option.getOrElse(() => snippet),
  );

const summaryOf = (text: string): Explanation["state"] => ({
  chars: text.length,
  head: text.replaceAll(/\s+/gu, " ").trim().slice(START, STATE_HEAD_CHARS),
});

type Base = Pick<
  Explanation,
  "file" | "line" | "column" | "rule" | "model" | "cutoff" | "state" | "questions"
>;

interface Sent {
  readonly pass: ExplainPass;
  readonly sent: readonly WireRequest[];
}

const baseOf = (
  { pass, sent }: Sent,
  match: RuleMatch,
  { ref, loc }: Placed,
): ((answers: Answers) => Base) => {
  const questions = sentFor(sent, ref);
  return (answers) => ({
    file: relativeTo(pass.cwd, pass.filename),
    line: loc.start.line,
    column: loc.start.column + COLUMN_BASE,
    rule: match.rule.id,
    model: pass.model,
    cutoff: match.rule.cutoff,
    state: summaryOf(stateTextOf(sent, ref, match.snippet)),
    questions: questions.map(([id, question]) => ({
      id,
      question: question.instructions,
      probabilities: probabilitiesOf(answers[id]),
    })),
  });
};

const fixed = (value: number): string => value.toFixed(DECIMALS);

const cachedText = (cached: boolean | undefined): string =>
  Option.match(Option.fromUndefinedOr(cached), {
    onNone: () => "unknown",
    onSome: (hit) => Bool.match(hit, { onTrue: () => "yes", onFalse: () => "no" }),
  });

const probabilitiesText = (probabilities: Readonly<Record<string, number>>): string =>
  Option.match(
    Arr.match(Object.entries(probabilities), {
      onEmpty: () => Option.none<string>(),
      onNonEmpty: (entries) =>
        Option.some(entries.map(([label, value]) => `${label}=${fixed(value)}`).join(" ")),
    }),
    { onNone: () => "(no answer)", onSome: (text) => text },
  );

const verdictText = (explanation: Explanation): string => {
  if (Predicate.isNotUndefined(explanation.error)) {
    return `error: ${explanation.error}`;
  }
  const outcome = Bool.match(explanation.reported, {
    onTrue: () => "reported",
    onFalse: () => "not reported",
  });
  const cutoff = `cutoff ${fixed(explanation.cutoff)}`;
  return Option.match(Option.fromUndefinedOr(explanation.verdict), {
    onNone: () => `no verdict, ${cutoff}, ${outcome}`,
    onSome: ({ answer, probability }) => `${answer} ${fixed(probability)}, ${cutoff}, ${outcome}`,
  });
};

const servedText = (served: string | undefined): string =>
  Option.match(Option.fromUndefinedOr(served), {
    onNone: () => "",
    onSome: (id) => ` (served ${id})`,
  });

const asText = (explanation: Explanation): string =>
  [
    `${PREFIX} explain: ${explanation.file}:${String(explanation.line)}:${String(explanation.column)} [${explanation.rule}] ${explanation.model}${servedText(explanation.served)} cached=${cachedText(explanation.cached)}`,
    `  state: ${String(explanation.state.chars)} chars ${JSON.stringify(explanation.state.head)}`,
    ...explanation.questions.map(
      ({ id, question, probabilities }) =>
        `  ${id}: ${probabilitiesText(probabilities)}\n    ${question}`,
    ),
    `  verdict: ${verdictText(explanation)}`,
  ].join("\n");

const printerFor =
  (mode: "text" | "json") =>
  (explanation: Explanation): void => {
    const line = Bool.match(mode === "json", {
      onTrue: () => JSON.stringify(explanation),
      onFalse: () => asText(explanation),
    });
    Effect.runFork(Console.error(line));
  };

const explaining = (pass: ExplainPass, mode: "text" | "json"): Explainer => {
  const sent = wireRequestsFor(pass.request);
  const print = printerFor(mode);
  return {
    outcome: (match, at, { served, answers, cached, verdict, reported }) => {
      print({
        ...baseOf({ pass, sent }, match, at)(answers),
        served,
        ...Option.match(Option.fromUndefinedOr(cached), {
          onNone: () => ({}),
          onSome: (hit) => ({ cached: hit }),
        }),
        ...Option.match(verdict, { onNone: () => ({}), onSome: (found) => ({ verdict: found }) }),
        reported,
      });
    },
    failure: (matches, reason) => {
      for (const [index, match] of matches.entries()) {
        const at = { ref: refAt(index), loc: match.loc };
        print({ ...baseOf({ pass, sent }, match, at)({}), reported: false, error: reason });
      }
    },
  };
};

const SILENT: Explainer = { outcome: Fn.constVoid, failure: Fn.constVoid };

const explainerFor = (pass: ExplainPass): Explainer =>
  Match.value(explainModeOf(pass.setting)).pipe(
    Match.when("off", () => SILENT),
    Match.orElse((mode) => explaining(pass, mode)),
  );

export { explainerFor };
export type { Explainer, ExplainPass, Outcome, Placed };

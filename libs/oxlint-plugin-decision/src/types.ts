import type { Location, Range } from "@oxlint/plugins";

type Target = "function" | "call" | "jsx" | "file";

type CiBehavior = "skip" | "fail";

type ModelSpec = string | readonly string[];

interface RuleLocation {
  readonly question: string;
  readonly cutoff: number;
}

type EnclosingKind = "function" | "class" | "block";

type RuleContext =
  | { readonly scope: "node" }
  | { readonly scope: "lines"; readonly before?: number; readonly after?: number }
  | { readonly scope: "enclosing"; readonly kind: EnclosingKind }
  | { readonly scope: "file" };

type Severity = "info" | "warn" | "error";

type RuleAnswer =
  | { readonly kind: "boolean" }
  | {
      readonly kind: "classify";
      readonly labels: Readonly<Record<string, string>>;
      readonly report: readonly [string, ...string[]];
    }
  | { readonly kind: "severity"; readonly minimum?: Severity };

interface DecisionRule {
  readonly id: string;
  readonly target: Target;
  readonly question: string;
  readonly cutoff: number;
  readonly location?: RuleLocation;
  readonly model?: ModelSpec;
  readonly context?: RuleContext;
  readonly answer?: RuleAnswer;
}

interface DecisionOptions {
  readonly ci?: CiBehavior;
  readonly timeoutMs?: number;
  readonly maxMatchesPerFile?: number;
  readonly maxSnippetChars?: number;
  readonly model?: ModelSpec;
}

interface NoulQuestion {
  readonly type: "noul";
  readonly instructions: string;
}

interface ChoiceQuestion {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string | null>>;
}

type Question = NoulQuestion | ChoiceQuestion;

interface DecisionRequest {
  readonly model: string;
  readonly state: {
    readonly snippets: Readonly<Record<string, string>>;
    readonly contexts?: Readonly<Record<string, string>>;
  };
  readonly questions: Readonly<Record<string, Question>>;
}

type DecideResult =
  | { readonly ok: true; readonly response: unknown }
  | { readonly ok: false; readonly reason: string };

interface DecideInput {
  readonly request: DecisionRequest;
  readonly timeoutMs: number;
}

interface DecisionProvider {
  readonly name: string;
  readonly requiredEnv: readonly string[];
  readonly decide: (input: DecideInput) => DecideResult;
}

interface DecisionPluginSetup extends DecisionOptions {
  readonly name?: string;
  readonly rules: readonly DecisionRule[];
  readonly providers?: readonly DecisionProvider[];
}

interface DecisionPlugin {
  readonly meta: { readonly name: string };
  readonly rules: Readonly<Record<string, object>>;
}

interface ModelRef {
  readonly id: string;
  readonly provider: DecisionProvider;
  readonly model: string;
}

interface ResolvedRule extends DecisionRule {
  readonly models: readonly ModelRef[];
  readonly answer: RuleAnswer;
}

interface ResolvedOptions {
  readonly ci: CiBehavior;
  readonly timeoutMs: number;
  readonly maxMatchesPerFile: number;
  readonly maxSnippetChars: number;
  readonly rules: readonly ResolvedRule[];
}

interface RequestMatch {
  readonly rule: Pick<ResolvedRule, "question" | "location" | "answer">;
  readonly snippet: string;
  readonly truncated: boolean;
  readonly context?: string;
}

interface Match extends RequestMatch {
  readonly rule: ResolvedRule;
  readonly loc: Location;
}

interface Verdict {
  readonly answer: string;
  readonly probability: number;
}

interface Verdicts {
  readonly model: string;
  readonly results: Readonly<Record<string, Verdict>>;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly complete: boolean;
}

interface LineRange {
  readonly start: number;
  readonly end: number;
}

interface AstNode {
  readonly type: string;
  readonly range: Range;
  readonly loc: Location;
  readonly parent?: AstNode | null;
  readonly init?: unknown;
  readonly value?: unknown;
  readonly openingElement?: { readonly loc: Location } | null;
}

export type {
  AstNode,
  ChoiceQuestion,
  CiBehavior,
  DecideInput,
  DecideResult,
  DecisionOptions,
  DecisionPlugin,
  DecisionPluginSetup,
  DecisionProvider,
  DecisionRequest,
  DecisionRule,
  EnclosingKind,
  LineRange,
  Match,
  ModelRef,
  ModelSpec,
  NoulQuestion,
  Question,
  RequestMatch,
  ResolvedOptions,
  ResolvedRule,
  RuleAnswer,
  RuleContext,
  RuleLocation,
  Severity,
  Target,
  Verdict,
  Verdicts,
};

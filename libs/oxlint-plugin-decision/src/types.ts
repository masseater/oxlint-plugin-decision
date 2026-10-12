import type {
  DecisionsChoiceAnswer,
  DecisionsChoiceQuestion,
  DecisionsNoulAnswer,
  DecisionsNoulQuestion,
  DecisionsRequest,
  DecisionsResponse,
} from "@openrouter/sdk/models";
import type { Context, ESTree, Location, Range } from "@oxlint/plugins";

type Frozen<Value> = Value extends (...args: never) => unknown
  ? Value
  : Value extends object
    ? { readonly [Key in keyof Value]: Frozen<Value[Key]> }
    : Value;

type SelectedNode = Frozen<ESTree.Node>;

interface SelectMatch {
  readonly name: string | undefined;
  readonly context: Context;
}

type Target = "function" | "call" | "jsx" | "file";

type CiBehavior = "skip" | "fail";

type ModelSpec = string | readonly string[];

type ExplainSetting = boolean | "text" | "json";

interface RuleLocation {
  readonly question: string;
  readonly cutoff: number;
}

type EnclosingKind = "function" | "class" | "block";

type RuleContext =
  | { readonly scope: "node" }
  | { readonly scope: "lines"; readonly before?: number; readonly after?: number }
  | { readonly scope: "enclosing"; readonly kind: EnclosingKind }
  | { readonly scope: "file" }
  | { readonly scope: "comment" };

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
  readonly message?: string;
  readonly select?: (node: SelectedNode, match: SelectMatch) => boolean;
  readonly location?: RuleLocation;
  readonly model?: ModelSpec;
  readonly context?: RuleContext;
  readonly answer?: RuleAnswer;
}

interface DecisionOptions {
  readonly ci?: CiBehavior;
  readonly timeoutMs?: number;
  readonly maxSnippetChars?: number;
  readonly model?: ModelSpec;
  readonly env?: Readonly<Record<string, string>>;
  readonly explain?: ExplainSetting;
}

interface NoulQuestion extends Readonly<Pick<DecisionsNoulQuestion, "type" | "instructions">> {
  readonly instructions: string;
}

interface ChoiceQuestion extends Readonly<
  Pick<DecisionsChoiceQuestion, "type" | "instructions" | "criteria">
> {
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string | null>>;
}

type Question = NoulQuestion | ChoiceQuestion;

interface DecisionRequest extends Readonly<
  Pick<DecisionsRequest, "model" | "state" | "questions">
> {
  readonly state: {
    readonly snippets: Readonly<Record<string, string>>;
    readonly contexts?: Readonly<Record<string, string>>;
  };
  readonly questions: Readonly<Record<string, Question>>;
}

type DecisionResponse = Frozen<Pick<DecisionsResponse, "model" | "answers">>;

type Answers = DecisionResponse["answers"];

type Answer = Answers[string];

type NoulAnswer = Frozen<DecisionsNoulAnswer>;

type ChoiceAnswer = Frozen<DecisionsChoiceAnswer>;

type DecideResult =
  | { readonly ok: true; readonly response: DecisionResponse; readonly cached?: boolean }
  | { readonly ok: false; readonly reason: string };

interface DecideInput {
  readonly request: DecisionRequest;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string>>;
}

interface DecisionProvider {
  readonly name: string;
  readonly requiredEnv: readonly string[];
  readonly decide: (input: DecideInput) => DecideResult;
  readonly decideAll?: (inputs: readonly DecideInput[]) => readonly DecideResult[];
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
  readonly maxSnippetChars: number;
  readonly env: Readonly<Record<string, string>>;
  readonly explain: ExplainSetting;
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
  readonly answers: Answers;
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
  readonly id?: AstNode | null;
  readonly key?: AstNode;
  readonly callee?: AstNode;
  readonly openingElement?: { readonly loc: Location; readonly name?: AstNode } | null;
}

export type {
  Answer,
  Answers,
  AstNode,
  ChoiceAnswer,
  Frozen,
  SelectedNode,
  SelectMatch,
  ChoiceQuestion,
  CiBehavior,
  DecideInput,
  DecideResult,
  DecisionOptions,
  DecisionPlugin,
  DecisionPluginSetup,
  DecisionProvider,
  DecisionRequest,
  DecisionResponse,
  DecisionRule,
  EnclosingKind,
  ExplainSetting,
  LineRange,
  Match,
  ModelRef,
  ModelSpec,
  NoulAnswer,
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

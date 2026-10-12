import { Schema } from "effect";

const NONE = 0;
const MINIMUM_LABELS = 2;

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(NONE));

const Probability = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

const TargetSchema = Schema.Literals(["function", "call", "jsx", "file"]);

const CiBehaviorSchema = Schema.Literals(["skip", "fail"]);

const ExplainSettingSchema = Schema.Union([Schema.Boolean, Schema.Literals(["text", "json"])]);

const EnclosingKindSchema = Schema.Literals(["function", "class", "block"]);

const RuleContextSchema = Schema.Union([
  Schema.Struct({ scope: Schema.Literals(["node", "file", "comment"]) }),
  Schema.Struct({
    scope: Schema.Literal("lines"),
    before: Schema.optionalKey(NonNegativeInt),
    after: Schema.optionalKey(NonNegativeInt),
  }),
  Schema.Struct({ scope: Schema.Literal("enclosing"), kind: EnclosingKindSchema }),
]);

const SeveritySchema = Schema.Literals(["info", "warn", "error"]);

const Label = Schema.NonEmptyString;

const BooleanAnswer = Schema.Struct({ kind: Schema.Literal("boolean") });

const ClassifyAnswer = Schema.Struct({
  kind: Schema.Literal("classify"),
  labels: Schema.Record(Label, Schema.String).check(Schema.isMinProperties(MINIMUM_LABELS)),
  report: Schema.NonEmptyArray(Label),
}).check(
  Schema.makeFilter(({ labels, report }) => report.every((label) => Object.hasOwn(labels, label)), {
    message: "every label in report must be one of labels",
  }),
);

const SeverityAnswer = Schema.Struct({
  kind: Schema.Literal("severity"),
  minimum: Schema.optionalKey(SeveritySchema),
});

const RuleAnswerSchema = Schema.Union([BooleanAnswer, ClassifyAnswer, SeverityAnswer]);

export {
  CiBehaviorSchema,
  EnclosingKindSchema,
  ExplainSettingSchema,
  Probability,
  RuleAnswerSchema,
  RuleContextSchema,
  SeveritySchema,
  TargetSchema,
};

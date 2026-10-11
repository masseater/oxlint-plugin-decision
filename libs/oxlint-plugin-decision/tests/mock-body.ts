import { Array as Arr, Option, Schema } from "effect";
import { HttpServerResponse } from "effect/http";

const BAD_REQUEST = 400;
const LOCATION_SUFFIX = "_location";

const QuestionSchema = Schema.Struct({
  type: Schema.String,
  instructions: Schema.String,
  criteria: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});

const TextRecord = Schema.Record(Schema.String, Schema.String);

const StateSchema = Schema.Struct({
  snippets: TextRecord,
  contexts: Schema.optionalKey(TextRecord),
});

const Questions = Schema.Record(Schema.String, QuestionSchema);

const RawBodySchema = Schema.Struct({
  model: Schema.String,
  state: Schema.Union([Schema.String, StateSchema]),
  questions: Questions,
});

const BodySchema = Schema.Struct({
  model: Schema.String,
  state: StateSchema,
  questions: Questions,
});

type RawBody = typeof RawBodySchema.Type;
type Body = typeof BodySchema.Type;

const TEXT_STATE_PREFIX = "respan/";

const rejectsState = ({ model, state }: RawBody): boolean =>
  model.startsWith(TEXT_STATE_PREFIX) && typeof state !== "string";

const badState = HttpServerResponse.jsonUnsafe(
  { error: { message: "Respan state must be a string" } },
  { status: BAD_REQUEST },
);

const SECTION = /^state\.(?<kind>snippets|contexts)\.(?<ref>[^:\n]+):\n(?<text>[\s\S]*)$/u;

const sectionsOf = (text: string, kind: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    text.split(/\n\n(?=state\.(?:snippets|contexts)\.)/u).flatMap((section) =>
      Option.fromNullishOr(SECTION.exec(section)).pipe(
        Option.flatMap((found) => Option.fromUndefinedOr(found.groups)),
        Option.filter((groups) => groups["kind"] === kind),
        Option.map((groups) => [String(groups["ref"]), String(groups["text"])] as const),
        Option.toArray,
      ),
    ),
  );

const normalized = (raw: RawBody): Body => {
  if (typeof raw.state !== "string") {
    return { ...raw, state: raw.state };
  }
  const contexts = sectionsOf(raw.state, "contexts");
  const snippets = sectionsOf(raw.state, "snippets");
  if (Arr.isReadonlyArrayEmpty(Object.keys(contexts))) {
    return { ...raw, state: { snippets } };
  }
  return { ...raw, state: { snippets, contexts } };
};

type Question = typeof QuestionSchema.Type;

export { LOCATION_SUFFIX, RawBodySchema, badState, normalized, rejectsState };
export type { Body, Question, RawBody };

import { Schema } from "effect";
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

const normalized = (raw: RawBody): Body => {
  if (typeof raw.state !== "string") {
    return { ...raw, state: raw.state };
  }
  const text = raw.state;
  const refs = Object.keys(raw.questions).filter((ref) => !ref.endsWith(LOCATION_SUFFIX));
  return { ...raw, state: { snippets: Object.fromEntries(refs.map((ref) => [ref, text])) } };
};

type Question = typeof QuestionSchema.Type;

export { LOCATION_SUFFIX, RawBodySchema, badState, normalized, rejectsState };
export type { Body, Question, RawBody };

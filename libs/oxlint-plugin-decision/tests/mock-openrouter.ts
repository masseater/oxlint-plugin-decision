import { NodeHttpServer } from "@effect/platform-node";
import { Array as Arr, Context, Effect, Layer, Option, Ref, Schema } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";

const PII_MARKER = "user.email, user.phone";

const MARKER_BY_QUESTION: Readonly<Record<string, string>> = {
  "personal data": PII_MARKER,
  "only reads data": "loaded",
  "language model": String.raw`refunds.\n\n`,
};

const YES = 0.95;
const NO = 0.05;
const SURE = 0.99;
const UNSURE = 0.6;
const NO_HITS = 0;
const FIRST_HIT = 1;
const SECOND_HIT = 2;
const UNAUTHORIZED = 401;
const TOO_MANY_REQUESTS = 429;
const UNKNOWN_CHOICE = "unknown";
const LOCATED_LINE = /^L(?<line>\d+)\|/u;
const RANGE_KEY = /^L(?<start>\d+)(?:-L(?<end>\d+))?$/u;

const QuestionSchema = Schema.Struct({
  type: Schema.String,
  instructions: Schema.String,
  criteria: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});

const TextRecord = Schema.Record(Schema.String, Schema.String);

const BodySchema = Schema.Struct({
  model: Schema.String,
  state: Schema.Struct({ snippets: TextRecord, contexts: Schema.optionalKey(TextRecord) }),
  questions: Schema.Record(Schema.String, QuestionSchema),
});

type Body = typeof BodySchema.Type;

interface LoggedRequest {
  readonly authorization: string;
  readonly body: Body;
}

interface MockState {
  readonly log: Ref.Ref<readonly LoggedRequest[]>;
  readonly hits: Ref.Ref<Readonly<Record<string, number>>>;
}

interface MockShape extends MockState {
  readonly baseURL: string;
}

class MockOpenRouter extends Context.Service<MockOpenRouter, MockShape>()("MockOpenRouter") {}

const lookup = <Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Option.Option<Value> => Option.fromUndefinedOr(record[key]);

const snippetOf = (body: Body, ref: string): string =>
  Option.getOrElse(lookup(body.state.snippets, ref), () => "");

const scoreFor = (question: string, snippet: string): number =>
  Arr.findFirst(Object.entries(MARKER_BY_QUESTION), ([topic]) => question.includes(topic)).pipe(
    Option.filter(([, marker]) => snippet.includes(marker)),
    Option.match({ onNone: () => NO, onSome: () => YES }),
  );

const isRefinement = (body: Body): boolean =>
  Object.values(body.questions).every((question) => question.type === "choice");

const markedLine = (snippet: string): number =>
  Arr.findFirst(snippet.split("\n"), (text) => text.includes(PII_MARKER)).pipe(
    Option.flatMap((text) => Option.fromNullishOr(LOCATED_LINE.exec(text))),
    Option.flatMap((found) => Option.fromUndefinedOr(found.groups)),
    Option.flatMap((groups) => lookup(groups, "line")),
    Option.match({ onNone: () => Number.NaN, onSome: Number }),
  );

const keyContains = (key: string, line: number): boolean =>
  Option.fromNullishOr(RANGE_KEY.exec(key)).pipe(
    Option.flatMap((found) => Option.fromUndefinedOr(found.groups)),
    Option.exists((groups) => {
      const start = Number(groups["start"]);
      const end = Number(Option.getOrElse(lookup(groups, "end"), () => groups["start"]));
      return start <= line && line <= end;
    }),
  );

const selectedChoice = (body: Body, ref: string, token: string): string => {
  if (token === "location-unknown") {
    return UNKNOWN_CHOICE;
  }
  const line = markedLine(snippetOf(body, ref.replace(/_location$/u, "")));
  return lookup(body.questions, ref).pipe(
    Option.flatMap((question) => Option.fromUndefinedOr(question.criteria)),
    Option.flatMap((criteria) =>
      Arr.findFirst(Object.keys(criteria), (key) => keyContains(key, line)),
    ),
    Option.getOrElse(() => UNKNOWN_CHOICE),
  );
};

const choiceAnswer = (body: Body, ref: string, token: string): unknown => {
  const choice = selectedChoice(body, ref, token);
  let probability = SURE;
  if (token === "location-uncertain") {
    probability = UNSURE;
  }
  return { type: "choice", choice, probabilities: { [choice]: probability } };
};

const noulScore = (body: Body, ref: string, token: string): number => {
  if (token === "location-always-positive") {
    return SURE;
  }
  if (token === "location-no-violation") {
    return NO;
  }
  const instructions = lookup(body.questions, ref).pipe(
    Option.match({ onNone: () => "", onSome: (question) => question.instructions }),
  );
  return scoreFor(instructions, snippetOf(body, ref));
};

const skipsChoice = (body: Body, token: string, hits: number): boolean =>
  (token === "location-missing-once" && hits === FIRST_HIT) ||
  (token === "refinement-missing-once" && isRefinement(body) && hits === SECOND_HIT);

const answerOf =
  (body: Body, token: string, hits: number) =>
  ([ref, question]: readonly [string, Body["questions"][string]]): readonly [string, unknown][] => {
    if (question.type !== "choice") {
      return [[ref, { type: "noul", noul: noulScore(body, ref, token) }]];
    }
    if (skipsChoice(body, token, hits)) {
      return [];
    }
    return [[ref, choiceAnswer(body, ref, token)]];
  };

const answer = (body: Body, token: string, hits: number): unknown => {
  const answers = Object.fromEntries(
    Object.entries(body.questions).flatMap((entry) => answerOf(body, token, hits)(entry)),
  );
  let model = "mock-decider";
  if (body.model === "second") {
    model = "mock-second";
  }
  return {
    model,
    answers,
    usage: { input_tokens: NO_HITS, output_tokens: NO_HITS, cost: NO_HITS },
  };
};

const unauthorized = HttpServerResponse.jsonUnsafe(
  { error: { message: "bad key" } },
  { status: UNAUTHORIZED },
);

const replyFor = (
  body: Body,
  token: string,
  hits: number,
): Effect.Effect<HttpServerResponse.HttpServerResponse> => {
  const refinement = isRefinement(body);
  if (token === "slow" || (refinement && token === "refinement-slow")) {
    return Effect.never;
  }
  if (token === "unauthorized" || (refinement && token === "refinement-fails")) {
    return Effect.succeed(unauthorized);
  }
  if (token === "flaky" && hits === FIRST_HIT) {
    return Effect.succeed(
      HttpServerResponse.jsonUnsafe(
        {},
        { status: TOO_MANY_REQUESTS, headers: { "retry-after-ms": "10" } },
      ),
    );
  }
  return Effect.succeed(HttpServerResponse.jsonUnsafe(answer(body, token, hits)));
};

const countHit = (state: MockState, token: string): Effect.Effect<number> =>
  Ref.modify(state.hits, (all) => {
    const next = Option.getOrElse(lookup(all, token), () => NO_HITS) + FIRST_HIT;
    return [next, { ...all, [token]: next }];
  });

const handler = (
  state: MockState,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  unknown,
  HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* handle() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = yield* Schema.decodeUnknownEffect(BodySchema)(yield* request.json);
    const authorization = Option.getOrElse(lookup(request.headers, "authorization"), () => "");
    const token = authorization.replace("Bearer ", "");
    yield* Ref.update(state.log, (log) => [...log, { authorization, body }]);
    return yield* replyFor(body, token, yield* countHit(state, token));
  });

const MockLive = Layer.effect(
  MockOpenRouter,
  Effect.gen(function* make() {
    const log = yield* Ref.make<readonly LoggedRequest[]>([]);
    const hits = yield* Ref.make<Readonly<Record<string, number>>>({});
    const baseURL = yield* HttpServer.addressFormattedWith((address) =>
      Effect.succeed(`${address}/api/v1`),
    );
    return { log, hits, baseURL };
  }),
);

const routes = Layer.unwrap(
  Effect.gen(function* serve() {
    const state = yield* MockOpenRouter;
    return HttpRouter.serve(HttpRouter.add("POST", "/api/alpha/decisions", handler(state)), {
      disableLogger: true,
      disableListenLog: true,
    });
  }),
);

const MockOpenRouterLayer = routes.pipe(
  Layer.provideMerge(MockLive),
  Layer.provideMerge(NodeHttpServer.layerTest),
);

const loggedRequests: Effect.Effect<readonly LoggedRequest[], never, MockOpenRouter> = Effect.gen(
  function* logged() {
    const { log } = yield* MockOpenRouter;
    return yield* Ref.get(log);
  },
);

export { MockOpenRouter, MockOpenRouterLayer, loggedRequests };
export type { LoggedRequest };

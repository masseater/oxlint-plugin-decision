import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterError } from "@openrouter/sdk/models/errors";
import {
  Array as Arr,
  Config,
  Crypto,
  Effect,
  FileSystem,
  Option,
  Path,
  Redacted,
  Schema,
  pipe,
} from "effect";
import { runAsWorker } from "synckit";

import { AnswerSchema } from "./answer.ts";
import { parseVerdicts } from "./request.ts";
import { envNameOf, messageOf } from "./runtime.ts";
import { workerServices } from "./services.ts";
import type { DecideInput, DecideResult, DecisionRequest, DecisionResponse } from "./types.ts";
import { mergeResponses, wireRequestsFor } from "./wire.ts";
import type { WireRequest } from "./wire.ts";

const CACHE_VERSION = 7;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;
const RETRY_INITIAL_MS = 10;
const RETRY_EXPONENT = 2;
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const API_SUFFIX = /\/api\/v1\/*$|\/+$/u;
const CACHE_DIR = ["node_modules", ".cache", "oxlint-plugin-decision"] as const;

const reasonFor = (error: unknown): string => {
  if (error instanceof OpenRouterError) {
    return `http ${String(error.statusCode)}: ${error.message}`;
  }
  return `network: ${messageOf(error)}`;
};

const serverUrlOf = (env: Readonly<Record<string, string>>): Config.Config<string> =>
  Config.String(envNameOf(env, "OPENROUTER_BASE_URL")).pipe(
    Config.withDefault(DEFAULT_BASE_URL),
    Config.map((url) => url.trim().replace(API_SUFFIX, "")),
  );

const toHex = (bytes: readonly number[]): string =>
  bytes.map((byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, "0")).join("");

const cacheFile = Effect.fn("cacheFile")(function* cacheFile(
  endpoint: string,
  request: DecisionRequest,
) {
  const crypto = yield* Crypto.Crypto;
  const path = yield* Path.Path;
  const payload = new TextEncoder().encode(
    JSON.stringify({ version: CACHE_VERSION, endpoint, request }),
  );
  const digest = yield* crypto.digest("SHA-256", payload);
  return path.resolve(...CACHE_DIR, `${toHex([...digest])}.json`);
});

const CachedResponse = Schema.Struct({
  model: Schema.NonEmptyString,
  answers: Schema.Record(Schema.String, AnswerSchema),
});

const decodeCached = Schema.decodeOption(Schema.fromJsonString(CachedResponse));

const isComplete = (response: DecisionResponse, request: DecisionRequest): boolean =>
  Option.liftThrowable(() => parseVerdicts(response, request).complete)().pipe(
    Option.getOrElse(() => false),
  );

const readCache = Effect.fn("readCache")(function* readCache(
  file: string,
  request: DecisionRequest,
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file).pipe(Effect.option);
  return text.pipe(
    Option.flatMap((raw): Option.Option<DecisionResponse> => decodeCached(raw)),
    Option.filter((response) => isComplete(response, request)),
  );
});

const writeCache = Effect.fn("writeCache")(function* writeCache(
  file: string,
  response: DecisionResponse,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const temp = `${file}.tmp-${String(Date.now())}`;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(temp, JSON.stringify(response));
  yield* fs.rename(temp, file);
});

const send = Effect.fn("send")(function* send(
  endpoint: string,
  decisionsRequest: WireRequest,
  { timeoutMs, env }: Pick<DecideInput, "timeoutMs" | "env">,
) {
  const apiKey = yield* Config.Redacted(envNameOf(env, "OPENROUTER_API_KEY"));
  const client = new OpenRouter({ apiKey: Redacted.value(apiKey) });
  return yield* Effect.tryPromise({
    try: (signal) =>
      client.alpha.decisions.create(
        { decisionsRequest },
        {
          serverURL: endpoint,
          retries: {
            strategy: "backoff",
            backoff: {
              initialInterval: RETRY_INITIAL_MS,
              maxInterval: timeoutMs,
              exponent: RETRY_EXPONENT,
              maxElapsedTime: timeoutMs,
            },
            retryConnectionErrors: false,
          },
          retryCodes: ["429", "5XX"],
          signal,
        },
      ),
    catch: reasonFor,
  });
});

const ask = Effect.fn("ask")(function* ask(
  endpoint: string,
  { request, timeoutMs, env }: DecideInput,
) {
  const responses = yield* Effect.forEach(
    wireRequestsFor(request),
    (wire) => send(endpoint, wire, { timeoutMs, env }),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.timeoutOrElse({
      duration: timeoutMs,
      orElse: () => Effect.fail("timeout"),
    }),
  );
  return mergeResponses(request, responses);
});

const askAndStore = Effect.fn("askAndStore")(function* askAndStore(
  endpoint: string,
  file: string,
  input: DecideInput,
) {
  const response = yield* ask(endpoint, input);
  if (isComplete(response, input.request)) {
    yield* writeCache(file, response).pipe(Effect.ignore);
  }
  return response;
});

const decide = Effect.fn("decide")(function* decide(input: DecideInput) {
  yield* Effect.annotateCurrentSpan({ model: input.request.model });
  const endpoint = yield* serverUrlOf(input.env);
  const file = yield* cacheFile(endpoint, input.request);
  const cached = yield* readCache(file, input.request);
  yield* Effect.annotateCurrentSpan({ cached: Option.isSome(cached) });
  if (Option.isSome(cached)) {
    return { response: cached.value, cached: true };
  }
  return { response: yield* askAndStore(endpoint, file, input), cached: false };
});

const reasonOf = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  return messageOf(error);
};

const decideOne = (
  input: DecideInput,
): Effect.Effect<DecideResult, never, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  decide(input).pipe(
    Effect.match({
      onSuccess: ({ response, cached }): DecideResult => ({ ok: true, response, cached }),
      onFailure: (error): DecideResult => ({ ok: false, reason: reasonOf(error) }),
    }),
  );

const decideEach = (
  inputs: Arr.NonEmptyReadonlyArray<DecideInput>,
): Effect.Effect<Arr.NonEmptyReadonlyArray<DecideResult>> =>
  Effect.all(
    pipe(
      inputs,
      Arr.map((input) => decideOne(input)),
    ),
    { concurrency: "unbounded" },
  ).pipe(Effect.provide(workerServices));

const run = (
  inputs: Arr.NonEmptyReadonlyArray<DecideInput>,
): Promise<Arr.NonEmptyReadonlyArray<DecideResult>> => Effect.runPromise(decideEach(inputs));

runAsWorker(run);

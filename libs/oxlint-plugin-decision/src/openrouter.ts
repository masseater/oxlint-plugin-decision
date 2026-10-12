import { Array as Arr, Effect, pipe } from "effect";
import { createSyncFn } from "synckit";
import type { Syncify } from "synckit";

import { messageOf, runOrElse } from "./runtime.ts";
import type { DecideInput, DecideResult, DecisionProvider } from "./types.ts";

const BACKSTOP_MS = 60_000;
const SYNCKIT_TIMEOUT = "Internal error: Atomics.wait() failed: timed-out";

type Inputs = Arr.NonEmptyReadonlyArray<DecideInput>;

type Results = Arr.NonEmptyReadonlyArray<DecideResult>;

type Worker = (inputs: Inputs) => Promise<Results>;

const workers = new Map<"openrouter", Syncify<Worker>>();

const workerCall = (): Syncify<Worker> => {
  const existing = workers.get("openrouter");
  if (existing) {
    return existing;
  }
  const created = createSyncFn<Worker>(new URL("openrouter-worker.mjs", import.meta.url), {
    timeout: BACKSTOP_MS,
  });
  workers.set("openrouter", created);
  return created;
};

const reasonOf = (error: unknown): string => {
  const message = messageOf(error);
  if (message === SYNCKIT_TIMEOUT) {
    return "timeout";
  }
  return `network: ${message}`;
};

const ask = (inputs: Inputs): Results =>
  runOrElse(
    Effect.sync(() => workerCall()(inputs)),
    (cause) =>
      pipe(
        inputs,
        Arr.map((): DecideResult => ({ ok: false, reason: reasonOf(cause) })),
      ),
  );

const openRouter: DecisionProvider = {
  name: "openrouter",
  requiredEnv: ["OPENROUTER_API_KEY"],
  decide: (input) => Arr.headNonEmpty(ask([input])),
  decideAll: (inputs) => Arr.match(inputs, { onEmpty: () => [], onNonEmpty: (some) => ask(some) }),
};

export { openRouter };

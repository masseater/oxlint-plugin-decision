import { layer } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Effect, Layer, Match, Option } from "effect";

import { openRouter } from "#src/openrouter.ts";
import { envNameOf, envOf, failsInCi, messageOf, runOrElse, warnOnce } from "#src/runtime.ts";
import type { ResolvedOptions } from "#src/types.ts";

const TIMEOUT_MS = 5;
const NETWORK = "network: ";
const ONE_PREFIX = 2;
const NO_FAILURE = 0;

const options: ResolvedOptions = {
  ci: "fail",
  explain: false,
  timeoutMs: TIMEOUT_MS,
  maxSnippetChars: 1,
  env: { OPENROUTER_API_KEY: "TEAM_KEY" },
  rules: [],
};

const describesErrors = Effect.sync(() => {
  strictEqual(messageOf(new Error("boom")), "boom");
  strictEqual(messageOf("plain"), "plain");
});

const fallsBack = Effect.sync(() => {
  strictEqual(runOrElse(Effect.fail("nope"), messageOf), "nope");
});

const renamesEnv = Effect.sync(() => {
  strictEqual(envNameOf(options.env, "OPENROUTER_API_KEY"), "TEAM_KEY");
  strictEqual(envNameOf(options.env, "OTHER"), "OTHER");
});

const readsEnv = Effect.sync(() => {
  strictEqual(Option.isNone(envOf("OXLINT_PLUGIN_DECISION_UNSET_VARIABLE")), true);
  strictEqual(failsInCi({ ...options, ci: "skip" }), false);
});

const warnsOnce = Effect.sync(() => {
  warnOnce("runtime-test", "first");
  warnOnce("runtime-test", "second");
});

const reportsWorkerFailure = Effect.sync(() => {
  const result = openRouter.decide({
    request: {
      model: "model",
      state: { snippets: { snippet: "ok();" } },
      questions: { snippet: { type: "noul", instructions: "Is it bad?" } },
    },
    timeoutMs: TIMEOUT_MS,
    env: {},
  });
  deepStrictEqual(
    Match.value(result).pipe(
      Match.when({ ok: false }, ({ reason }) => reason.split(NETWORK).length),
      Match.orElse(() => NO_FAILURE),
    ),
    ONE_PREFIX,
  );
});

layer(Layer.empty)("runtime helpers", (it) => {
  it.effect("describes errors and non-errors", () => describesErrors);
  it.effect("falls back when an effect fails", () => fallsBack);
  it.effect("renames environment variables", () => renamesEnv);
  it.effect("reads optional environment variables", () => readsEnv);
  it.effect("warns once per reason", () => warnsOnce);
  it.effect("reports a worker that cannot start as a failure", () => reportsWorkerFailure);
});

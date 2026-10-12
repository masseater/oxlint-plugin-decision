import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import { Config, Effect, FileSystem, Redacted } from "effect";

import strictConfig from "#example/claims/oxlint.config.ts";
import reviewOnlyConfig from "#example/claims/review-only.config.ts";

import {
  LIVE_MODEL,
  PLUGIN_NAME,
  TIMEOUT,
  configSource,
  forwardedEnv,
  fromRoot,
  headOf,
  outputOf,
  oxlint,
  reportedLines,
  tempProject,
} from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const LIVE_TIMEOUT_MS = 120_000;

const EXAMPLES = {
  strict: {
    config: strictConfig,
    reported: [
      "cart.test.js:29:3: [test-mocks-subject]",
      "cart.js:28:8: [pure-name-is-pure]",
      "cart.js:34:8: [safe-name-is-safe]",
      "cart.js:42:8: [catch-hides-failure]",
    ],
  },
  "review-only": {
    config: reviewOnlyConfig,
    reported: [
      "cart.test.js:35:1: [describe-names-subject]",
      "cart.js:4:8: [comment-describes-declaration]",
      "cart.js:4:8: [doc-errors-match-body]",
      "cart.js:18:8: [fn-name-promises]",
      "cart.js:34:8: [fn-name-promises]",
      "cart.js:47:5: [log-level-matches-event]",
    ],
  },
} as const;

type Entry = keyof typeof EXAMPLES;

const claimsLive = (entry: Entry): Effect.Effect<void, unknown, Services> =>
  Effect.scoped(
    Effect.gen(function* test() {
      const fs = yield* FileSystem.FileSystem;
      const key = yield* Config.Redacted("OPENROUTER_API_KEY");
      const example = yield* fromRoot("example", "claims");
      const cwd = yield* tempProject({
        "cart.js": yield* fs.readFileString(`${example}/cart.js`),
        "cart.test.js": yield* fs.readFileString(`${example}/cart.test.js`),
        "oxlint.config.ts": configSource({
          ...EXAMPLES[entry].config,
          jsPlugins: [yield* fromRoot("dist", `${entry}.mjs`)],
          settings: {
            [PLUGIN_NAME]: {
              model: LIVE_MODEL,
              timeoutMs: LIVE_TIMEOUT_MS,
            },
          },
        }),
      });
      const run = yield* oxlint(
        cwd,
        ["--format", "unix", "-c", "oxlint.config.ts", "cart.js", "cart.test.js"],
        { ...(yield* forwardedEnv), OPENROUTER_API_KEY: Redacted.value(key) },
      );
      yield* Effect.log(outputOf(run));
      deepStrictEqual(
        reportedLines(run, PLUGIN_NAME)
          .map((line) => headOf(line))
          .toSorted((left, right) => left.localeCompare(right)),
        [...EXAMPLES[entry].reported].toSorted((left, right) => left.localeCompare(right)),
      );
    }),
  );

layer(NodeServices.layer, { excludeTestServices: true })(
  "the claim rules on Span-01 Lite",
  (it) => {
    it.effect(
      "strict reports the broken promises in the example",
      () => claimsLive("strict"),
      TIMEOUT,
    );
    it.effect(
      "review-only reports the descriptions that misdescribe the example",
      () => claimsLive("review-only"),
      TIMEOUT,
    );
  },
);

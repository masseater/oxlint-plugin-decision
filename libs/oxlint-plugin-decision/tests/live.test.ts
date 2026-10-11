import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { strictEqual } from "@effect/vitest/utils";
import { Config, Effect, FileSystem, Path, Redacted, Schema } from "effect";

import { TIMEOUT, lintProject, outputOf } from "./fixtures.ts";
import { decisionLines, packageRoot } from "./oxlint.ts";

const LIVE_MODEL = "openrouter/respan/span-01-lite";
const PROVIDER_FAILURE = /http \d+|network:|timeout|is not set/u;

const RuleEntry = Schema.Tuple([Schema.String, Schema.Record(Schema.String, Schema.Unknown)]);

const ExampleConfig = Schema.fromJsonString(
  Schema.Struct({ rules: Schema.Struct({ "decision/ask": RuleEntry }) }),
);

const exampleOptions = Effect.gen(function* read() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* packageRoot;
  const raw = yield* fs.readFileString(path.join(root, "example", ".oxlintrc.json"));
  const [, options] = (yield* Schema.decodeUnknownEffect(ExampleConfig)(raw)).rules["decision/ask"];
  const files = {
    "fail.js": yield* fs.readFileString(path.join(root, "example", "fail.js")),
    "pass.js": yield* fs.readFileString(path.join(root, "example", "pass.js")),
  };
  return { files, options };
});

const answersLive = Effect.gen(function* test() {
  const key = yield* Config.Redacted("OPENROUTER_API_KEY");
  const { files, options } = yield* exampleOptions;
  const run = yield* lintProject({
    files,
    options: { ...options, model: LIVE_MODEL },
    env: { OPENROUTER_API_KEY: Redacted.value(key) },
  });
  yield* Effect.log(decisionLines(run).join("\n"));
  strictEqual(PROVIDER_FAILURE.test(outputOf(run)), false, outputOf(run));
});

layer(NodeServices.layer, { excludeTestServices: true })("the live OpenRouter API", (it) => {
  it.effect(
    "answers every question about the example without a provider failure",
    () => answersLive,
    TIMEOUT,
  );
});

import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Effect } from "effect";

import { FAILED, PASSED, TIMEOUT, callRule, lintProject, outputOf, withMock } from "./fixtures.ts";
import { decisionLines, mockEnv } from "./oxlint.ts";

const SOURCE = "console.log(user.email, user.phone);\n";
const REASON = "http 401: Response validation failed";

const warnsAndPasses = Effect.gen(function* test() {
  const env = yield* mockEnv("unauthorized");
  const run = yield* lintProject({
    files: { "log.js": SOURCE },
    options: { rules: [callRule] },
    env,
  });
  strictEqual(run.status, PASSED, outputOf(run));
  deepStrictEqual(decisionLines(run), []);
  assertInclude(run.stderr, REASON);
});

const failsInCi = Effect.gen(function* test() {
  const env = yield* mockEnv("unauthorized");
  const run = yield* lintProject({
    files: { "log.js": SOURCE },
    options: { ci: "fail", rules: [callRule] },
    env: { ...env, CI: "true" },
  });
  strictEqual(run.status, FAILED, outputOf(run));
  strictEqual(run.stderr.includes(REASON), false, run.stderr);
});

const explainsTheFailure = Effect.gen(function* test() {
  const env = yield* mockEnv("unauthorized");
  const run = yield* lintProject({
    files: { "log.js": SOURCE },
    options: { explain: "json", rules: [callRule] },
    env,
  });
  assertInclude(run.stderr, `"error":"${REASON}"`);
  assertInclude(run.stderr, '"reported":false');
});

layer(NodeServices.layer, { excludeTestServices: true })("a failed decision request", (it) => {
  it.effect("warns and lets the run pass", () => withMock(warnsAndPasses), TIMEOUT);
  it.effect("fails the run in CI when ci is fail", () => withMock(failsInCi), TIMEOUT);
  it.effect("is explained with its reason", () => withMock(explainsTheFailure), TIMEOUT);
});

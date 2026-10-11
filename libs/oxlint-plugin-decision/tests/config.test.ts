import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Effect } from "effect";

import type { DecisionOptions, DecisionRule } from "#src/types.ts";

import { PASSED, TIMEOUT, lintProject, outputOf } from "./fixtures.ts";
import { pluginPath, runOxlint, writeProject } from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const customPlugin = (
  dist: string,
): string => `import { createDecisionPlugin, defineDecisionRule, defineProvider } from ${JSON.stringify(dist)};

const yes = ({ request }) => ({
  ok: true,
  response: {
    model: "fake-1",
    answers: Object.fromEntries(Object.keys(request.questions).map((ref) => [ref, { type: "noul", noul: 0.9 }])),
  },
});

export default createDecisionPlugin({
  name: "custom",
  rules: [defineDecisionRule({ id: "code-rule", target: "call", question: "Is this a call?", cutoff: 0.5 })],
  providers: [defineProvider({ name: "fake", requiredEnv: ["FAKE_KEY"], decide: yes })],
});
`;

const CUSTOM_LINE =
  "log.js:1:1: [code-rule] fake/fake-1 answered yes (0.90 >= 0.50): Is this a call? [Error/custom(ask)]";

const customProvider = Effect.scoped(
  Effect.gen(function* test() {
    const cwd = yield* writeProject({
      "plugin.mjs": customPlugin(yield* pluginPath),
      "log.js": "console.log(user.email);\n",
      ".oxlintrc.json": JSON.stringify({
        jsPlugins: ["./plugin.mjs"],
        rules: { "custom/ask": ["error", { model: "fake/any", ci: "fail" }] },
      }),
    });
    const args = ["--format", "unix", "-c", ".oxlintrc.json", "log.js"];
    const without = yield* runOxlint({ cwd, args, env: {} });
    strictEqual(without.status, PASSED, outputOf(without));
    assertInclude(without.stderr, "FAKE_KEY is not set, skipping fake models");
    const withKey = yield* runOxlint({ cwd, args, env: { FAKE_KEY: "1" } });
    deepStrictEqual(
      withKey.stdout.split("\n").filter((line) => line.includes("custom(ask)")),
      [CUSTOM_LINE],
    );
  }),
);

const EVEN_ODDS = 0.5;
const ABOVE_CERTAIN = 1.01;

const goodRule: DecisionRule = { id: "a", target: "call", question: "Is it bad?", cutoff: 0.8 };

const fileRuleAt = (cutoff: number): DecisionRule => ({
  ...goodRule,
  target: "file",
  location: { question: "Where?", cutoff },
});

const badConfigs: readonly (readonly [string, DecisionOptions, string])[] = [
  [
    "location is configured for a non-file rule",
    { rules: [{ ...goodRule, location: { question: "Where?", cutoff: 0.75 } }] },
    "location is supported only for file rules",
  ],
  ["a location cutoff is not above 0.5", { rules: [fileRuleAt(EVEN_ODDS)] }, "cutoff"],
  ["a location cutoff is above 1", { rules: [fileRuleAt(ABOVE_CERTAIN)] }, "cutoff"],
  [
    "a plugin-level field is unknown",
    { rules: [goodRule], ...JSON.parse('{"foo":1}') },
    'Unexpected property "foo"',
  ],
  [
    "two rules share an id",
    { rules: [goodRule, { ...goodRule, target: "file", question: "Other?" }] },
    'oxlint-plugin-decision: rule id "a" is used more than once',
  ],
  [
    "a model names an unknown provider",
    { model: "acme/model-1", rules: [goodRule] },
    'oxlint-plugin-decision: model "acme/model-1" must be "<provider>/<model>" with a provider from: openrouter',
  ],
  [
    "a model has no provider prefix",
    { rules: [{ ...goodRule, model: "jev-latest" }] },
    'model "jev-latest" must be "<provider>/<model>"',
  ],
  [
    "a context scope is unknown",
    { rules: [{ ...goodRule, ...JSON.parse('{"context":{"scope":"repo"}}') }] },
    "context",
  ],
];

const refuses = ([, options, expected]: readonly [string, DecisionOptions, string]): Effect.Effect<
  void,
  unknown,
  Services
> =>
  Effect.gen(function* test() {
    const run = yield* lintProject({
      files: { "pass.js": "ok();\n" },
      options,
      env: {},
      format: "default",
    });
    strictEqual(run.status === PASSED, false);
    assertInclude(outputOf(run), expected);
  });

layer(NodeServices.layer, { excludeTestServices: true })("plugin configuration", (it) => {
  it.effect(
    "loads a custom plugin and asks only for the keys its providers need",
    () => customProvider,
    TIMEOUT,
  );
  it.effect.each(badConfigs)(
    "refuses a config where %s",
    (badConfig) => refuses(badConfig),
    TIMEOUT,
  );
});

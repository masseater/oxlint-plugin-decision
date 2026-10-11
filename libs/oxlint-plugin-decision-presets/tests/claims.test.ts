import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, FileSystem, Option } from "effect";

import strictConfig from "#example/claims/oxlint.config.ts";
import reviewOnlyConfig from "#example/claims/review-only.config.ts";

import {
  FAILED,
  PASSED,
  PLUGIN_NAME,
  TIMEOUT,
  configSource,
  fromRoot,
  outputOf,
  oxlint,
  tempProject,
} from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const alwaysYes = (core: string, entry: string, preset: string): string => `
import { createDecisionPlugin, defineProvider } from ${JSON.stringify(core)};
import { presets } from ${JSON.stringify(entry)};

const decide = ({ request }) => ({
  ok: true,
  response: {
    model: "fake-1",
    answers: Object.fromEntries(
      Object.keys(request.questions).map((ref) => [ref, { type: "noul", noul: 0.99 }]),
    ),
  },
});

export default createDecisionPlugin({
  name: ${JSON.stringify(PLUGIN_NAME)},
  rules: presets[${JSON.stringify(preset)}],
  providers: [defineProvider({ name: "fake", requiredEnv: [], decide })],
});
`;

const FUNCTIONS = [
  "cart.js:4",
  "cart.js:10",
  "cart.js:14",
  "cart.js:15",
  "cart.js:18",
  "cart.js:24",
  "cart.js:25",
  "cart.js:28",
  "cart.js:34",
  "cart.js:38",
  "cart.js:42",
];
const TESTS = [
  "cart.test.js:15",
  "cart.test.js:19",
  "cart.test.js:25",
  "cart.test.js:29",
  "cart.test.js:36",
];
const LOGS = ["cart.js:30", "cart.js:45", "cart.js:47"];

const EXAMPLES = {
  strict: {
    config: strictConfig,
    status: FAILED,
    asked: {
      "catch-hides-failure": FUNCTIONS,
      "idempotent-name": ["cart.js:38"],
      "pure-name-is-pure": ["cart.js:28"],
      "safe-name-is-safe": ["cart.js:34"],
      "test-mocks-subject": TESTS,
      "test-name-verifies-claim": TESTS,
    },
  },
  reviewOnly: {
    config: reviewOnlyConfig,
    status: PASSED,
    asked: {
      "comment-describes-block": FUNCTIONS,
      "comment-describes-declaration": ["cart.js:4"],
      "describe-names-subject": ["cart.test.js:14", "cart.test.js:24", "cart.test.js:35"],
      "doc-errors-match-body": ["cart.js:4"],
      "error-message-matches-condition": FUNCTIONS,
      "fn-name-promises": FUNCTIONS,
      "log-level-matches-event": LOGS,
      "log-message-matches-event": LOGS,
      "snapshot-only-behaviour-claim": TESTS,
      "test-name-describes-code": TESTS,
      "var-name-describes-value": FUNCTIONS,
    },
  },
} as const;

type Preset = keyof typeof EXAMPLES;

const REPORTED = /^(?<at>[^:]+:\d+):\d+: \[(?<id>[^\]]+)\]/u;

const reportOf = (line: string): Option.Option<readonly [string, string]> =>
  Option.fromNullishOr(REPORTED.exec(line)).pipe(
    Option.flatMap((found) => Option.fromUndefinedOr(found.groups)),
    Option.map((groups) => [String(groups["id"]), String(groups["at"])] as const),
  );

const byRule = (stdout: string): Readonly<Record<string, readonly string[]>> => {
  const reports = Arr.getSomes(stdout.split("\n").map((line) => reportOf(line)));
  const grouped = Arr.groupBy(reports, ([id]) => id);
  return Object.fromEntries(
    Object.entries(grouped).map(([id, found]) => [id, found.map(([, at]) => at)]),
  );
};

const exampleFile = (
  name: string,
): Effect.Effect<string, unknown, FileSystem.FileSystem | Services> =>
  Effect.gen(function* read() {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(yield* fromRoot("example", "claims", name));
  });

const askedWhere = (preset: Preset): Effect.Effect<void, unknown, Services> =>
  Effect.scoped(
    Effect.gen(function* test() {
      const core = yield* fromRoot(
        "node_modules",
        "@r_masseater",
        "oxlint-plugin-decision",
        "dist",
        "index.mjs",
      );
      const entry = yield* fromRoot("dist", "index.mjs");
      const cwd = yield* tempProject({
        "plugin.mjs": alwaysYes(core, entry, preset),
        "cart.js": yield* exampleFile("cart.js"),
        "cart.test.js": yield* exampleFile("cart.test.js"),
        "oxlint.config.ts": configSource({
          ...EXAMPLES[preset].config,
          jsPlugins: ["./plugin.mjs"],
          settings: { [PLUGIN_NAME]: { model: "fake/any", maxMatchesPerFile: 100 } },
        }),
      });
      const run = yield* oxlint(
        cwd,
        ["--format", "unix", "-c", "oxlint.config.ts", "cart.js", "cart.test.js"],
        {},
      );
      strictEqual(run.status, EXAMPLES[preset].status, outputOf(run));
      deepStrictEqual(byRule(run.stdout), EXAMPLES[preset].asked);
    }),
  );

layer(NodeServices.layer, { excludeTestServices: true })("the claim rules", (it) => {
  it.effect(
    "in strict ask only about the code each rule looks at",
    () => askedWhere("strict"),
    TIMEOUT,
  );
  it.effect(
    "in review-only ask only about the code each rule looks at",
    () => askedWhere("reviewOnly"),
    TIMEOUT,
  );
});

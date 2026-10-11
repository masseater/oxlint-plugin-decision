import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, FileSystem, Option, Schema } from "effect";

import { jev } from "#src/jev.ts";

import { FAILED, TIMEOUT, enabled, fromRoot, outputOf, oxlint, tempProject } from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const JEV = "decision-jev";

const alwaysYes = (core: string, entry: string): string => `
import { createDecisionPlugin, defineProvider } from ${JSON.stringify(core)};
import { jev } from ${JSON.stringify(entry)};

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
  name: ${JSON.stringify(JEV)},
  rules: jev,
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

const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  "catch-hides-failure": FUNCTIONS,
  "comment-describes-block": FUNCTIONS,
  "comment-describes-declaration": ["cart.js:4"],
  "describe-names-subject": ["cart.test.js:14", "cart.test.js:24", "cart.test.js:35"],
  "doc-errors-match-body": ["cart.js:4"],
  "error-message-matches-condition": FUNCTIONS,
  "fn-name-promises": FUNCTIONS,
  "idempotent-name": ["cart.js:38"],
  "log-level-matches-event": LOGS,
  "log-message-matches-event": LOGS,
  "pure-name-is-pure": ["cart.js:28"],
  "safe-name-is-safe": ["cart.js:34"],
  "snapshot-only-behaviour-claim": TESTS,
  "test-mocks-subject": TESTS,
  "test-name-describes-code": TESTS,
  "test-name-verifies-claim": TESTS,
  "var-name-describes-value": FUNCTIONS,
};

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
    return yield* fs.readFileString(yield* fromRoot("example", "jev", name));
  });

const ExampleConfig = Schema.Struct({
  rules: Schema.Record(Schema.String, Schema.Unknown),
  overrides: Schema.Array(Schema.Unknown),
});

const decodeConfig = Schema.decodeUnknownEffect(Schema.fromJsonString(ExampleConfig));

const askedWhere = Effect.scoped(
  Effect.gen(function* test() {
    const core = yield* fromRoot(
      "node_modules",
      "@r_masseater",
      "oxlint-plugin-decision",
      "dist",
      "index.mjs",
    );
    const entry = yield* fromRoot("dist", "jev.mjs");
    const config = yield* decodeConfig(yield* exampleFile(".oxlintrc.json"));
    const cwd = yield* tempProject({
      "plugin.mjs": alwaysYes(core, entry),
      "cart.js": yield* exampleFile("cart.js"),
      "cart.test.js": yield* exampleFile("cart.test.js"),
      ".oxlintrc.json": JSON.stringify({
        ...config,
        jsPlugins: ["./plugin.mjs"],
        settings: { [JEV]: { model: "fake/any", maxMatchesPerFile: 100 } },
      }),
    });
    const run = yield* oxlint(
      cwd,
      ["--format", "unix", "-c", ".oxlintrc.json", "cart.js", "cart.test.js"],
      {},
    );
    strictEqual(run.status, FAILED, outputOf(run));
    deepStrictEqual(byRule(run.stdout), EXPECTED);
  }),
);

const loadsEntry = Effect.scoped(
  Effect.gen(function* test() {
    const plugin = yield* fromRoot("dist", "jev.mjs");
    const cwd = yield* tempProject({
      "a.js": "function a() {}\n",
      ".oxlintrc.json": JSON.stringify({ jsPlugins: [plugin], rules: enabled(JEV, jev) }),
    });
    const run = yield* oxlint(cwd, ["-c", ".oxlintrc.json", "a.js"], { CI: "1" });
    strictEqual(run.status, FAILED, outputOf(run));
    assertInclude(outputOf(run), "OPENROUTER_API_KEY is not set");
  }),
);

layer(NodeServices.layer, { excludeTestServices: true })("the jev rules", (it) => {
  it.effect("ask only about the code each jev-lint rule looks at", () => askedWhere, TIMEOUT);
  it.effect("dist/jev.mjs loads as an oxlint plugin", () => loadsEntry, TIMEOUT);
});

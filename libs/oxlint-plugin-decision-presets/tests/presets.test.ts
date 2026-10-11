import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Effect, FileSystem } from "effect";
import type { PlatformError } from "effect/PlatformError";

import { PLUGIN_NAME } from "#src/plugin.ts";
import { presets } from "#src/presets.ts";

import {
  FAILED,
  PASSED,
  TIMEOUT,
  enabled,
  fromRoot,
  outputOf,
  oxlint,
  reportedLines,
  tempProject,
} from "./oxlint.ts";
import type { Run, Services } from "./oxlint.ts";

type PresetName = keyof typeof presets;

type Check = Effect.Effect<void, unknown, Services>;

const ID_START = "[";
const ID_END = "]";

const MARKERS = {
  "personal data": "user.email, user.phone",
  "language model prompt": "complete(`",
  "hard-coded secret": "sk_live_",
  "only reading or fetching": '"loaded"',
  "drop it": "catch {}",
  "untrusted input": "complete(`",
} as const;

const fakePlugin = (core: string, presetsEntry: string, preset: string): string => `
import { createDecisionPlugin, defineProvider } from ${JSON.stringify(core)};
import { presets } from ${JSON.stringify(presetsEntry)};

const MARKERS = ${JSON.stringify(MARKERS)};

const flagged = (instructions, snippet) =>
  Object.entries(MARKERS).some(([topic, marker]) => instructions.includes(topic) && snippet.includes(marker));

const answerFor = (request, ref, question) => {
  const snippet = typeof request.state === "string" ? request.state : request.state.snippets[ref] ?? "";
  const yes = flagged(question.instructions, snippet);
  if (question.type === "noul") {
    return { type: "noul", noul: yes ? 0.95 : 0.05 };
  }
  const labels = Object.keys(question.criteria);
  const choice = yes ? labels.at(-1) : labels[0];
  return { type: "choice", choice, probabilities: { [choice]: 0.95 } };
};

const decide = ({ request }) => ({
  ok: true,
  response: {
    model: "fake-1",
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([ref, question]) => [ref, answerFor(request, ref, question)]),
    ),
  },
});

export default createDecisionPlugin({
  rules: presets[${JSON.stringify(preset)}],
  providers: [defineProvider({ name: "fake", requiredEnv: [], decide })],
});
`;

const lintWithFake = (preset: PresetName): Effect.Effect<Run, PlatformError, Services> =>
  Effect.scoped(
    Effect.gen(function* lint() {
      const fs = yield* FileSystem.FileSystem;
      const core = yield* fromRoot("node_modules", "oxlint-plugin-decision", "dist", "index.mjs");
      const entry = yield* fromRoot("dist", "index.mjs");
      const cwd = yield* tempProject({
        "plugin.mjs": fakePlugin(core, entry, preset),
        "fail.js": yield* fs.readFileString(yield* fromRoot("example", "fail.js")),
        "pass.js": yield* fs.readFileString(yield* fromRoot("example", "pass.js")),
        ".oxlintrc.json": JSON.stringify({
          jsPlugins: ["./plugin.mjs"],
          settings: { decision: { model: "fake/any", ci: "fail" } },
          rules: enabled("decision", presets[preset]),
        }),
      });
      return yield* oxlint(
        cwd,
        ["--format", "unix", "-c", ".oxlintrc.json", "fail.js", "pass.js"],
        {},
      );
    }),
  );

const idsOf = (lines: readonly string[]): readonly string[] =>
  lines.map((line) => line.slice(line.indexOf(ID_START) + ID_START.length, line.indexOf(ID_END)));

const EXPECTED = {
  recommended: ["no-hardcoded-secrets", "no-pii-in-logs", "no-prompt-injection"],
  strict: [
    "no-hardcoded-secrets",
    "name-matches-behavior",
    "no-pii-in-logs",
    "no-prompt-injection",
    "untrusted-input-risk",
    "no-swallowed-errors",
  ],
  reviewOnly: ["name-matches-behavior"],
} as const satisfies Readonly<Record<PresetName, readonly string[]>>;

const reportsOnlyFail = (preset: PresetName): Check =>
  Effect.gen(function* test() {
    const run = yield* lintWithFake(preset);
    const lines = reportedLines(run, "decision");
    strictEqual(run.status, FAILED, outputOf(run));
    deepStrictEqual(
      lines.filter((line) => !line.startsWith("fail.js")),
      [],
    );
    deepStrictEqual(
      [...idsOf(lines)].toSorted((left, right) => left.localeCompare(right)),
      [...EXPECTED[preset]].toSorted((left, right) => left.localeCompare(right)),
    );
  });

const ENTRIES = ["recommended", "strict", "review-only", "index"] as const;

const loadsEntry = (entry: (typeof ENTRIES)[number]): Check =>
  Effect.scoped(
    Effect.gen(function* test() {
      const plugin = yield* fromRoot("dist", `${entry}.mjs`);
      const cwd = yield* tempProject({
        "a.js": "console.log(1);\n",
        ".oxlintrc.json": JSON.stringify({
          jsPlugins: [plugin],
          settings: { [PLUGIN_NAME]: { ci: "fail" } },
          rules: enabled(PLUGIN_NAME, entry === "review-only" ? presets.reviewOnly : presets.recommended),
        }),
      });
      const run = yield* oxlint(cwd, ["-c", ".oxlintrc.json", "a.js"], { CI: "1" });
      strictEqual(run.status === PASSED, false);
      assertInclude(outputOf(run), "OPENROUTER_API_KEY is not set");
    }),
  );

const customExample = Effect.gen(function* test() {
  const cwd = yield* fromRoot("example", "custom");
  const run = yield* oxlint(cwd, ["--format", "unix", "-c", ".oxlintrc.json", "handler.js"], {});
  strictEqual(run.status, PASSED, outputOf(run));
  assertInclude(run.stderr, "OPENROUTER_API_KEY is not set, skipping openrouter models");
});

layer(NodeServices.layer, { excludeTestServices: true })("the presets", (it) => {
  it.effect(
    "recommended reports only the risky code",
    () => reportsOnlyFail("recommended"),
    TIMEOUT,
  );
  it.effect("strict adds the stricter rules", () => reportsOnlyFail("strict"), TIMEOUT);
  it.effect("reviewOnly asks only the review rules", () => reportsOnlyFail("reviewOnly"), TIMEOUT);
  it.effect.each(ENTRIES)(
    "dist/%s.mjs loads as an oxlint plugin",
    (entry) => loadsEntry(entry),
    TIMEOUT,
  );
  it.effect("the custom example combines a preset with its own rule", () => customExample, TIMEOUT);
});

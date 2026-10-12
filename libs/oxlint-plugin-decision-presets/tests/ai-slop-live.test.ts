import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import { Array as Arr, Config, Effect, FileSystem, Option, Order, Redacted } from "effect";

import { aiSlopRules, duplicatesLibraryType } from "#src/ai-slop.ts";

import {
  TIMEOUT,
  configSource,
  enabled,
  fromRoot,
  outputOf,
  oxlint,
  reportedLines,
  tempProject,
} from "./oxlint.ts";

const AI_SLOP = "decision-ai-slop";
const LIVE_MODEL = "openrouter/respan/span-01-lite";
const LIVE_TIMEOUT_MS = 120_000;

const FORWARDED = [
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_ENV_PROXY",
  "SSL_CERT_FILE",
] as const;

const EXPECTED = [
  "fail.ts:4:8: [redundant-guard]",
  "fail.ts:14:8: [default-masks-missing-value]",
  "fail.ts:19:8: [pass-through-wrapper]",
  "fail.ts:23:8: [placeholder-implementation]",
  "fail.ts:27:8: [comment-restates-code]",
  "fail.ts:39:8: [comment-narrates-history]",
  "fail.ts:51:8: [doc-restates-signature]",
  "fail.ts:55:8: [cast-instead-of-narrowing]",
  "fail.ts:60:8: [suppression-instead-of-fix]",
  "fail.ts:66:8: [reinvents-builtin]",
];

const LIBRARY_TYPE_FILES = [
  "copies-library-type.ts",
  "checks-library-type.ts",
  "owns-schema.ts",
] as const;

const LIBRARY_TYPE_EXPECTED = [
  "13:29",
  "20:15",
  "26:23",
  "31:14",
  "33:17",
  "40:36",
  "43:20",
  "45:28",
  "50:20",
  "57:16",
  "63:25",
  "64:12",
  "70:17",
  "81:16",
].map((at) => `copies-library-type.ts:${at}: [duplicates-library-type]`);

const forwardedEnv = Effect.map(
  Effect.all(FORWARDED.map((name) => Effect.orDie(Config.option(Config.String(name))))),
  (values) =>
    Object.fromEntries(
      Arr.zip(FORWARDED, values).flatMap(([name, value]) =>
        Option.match(value, { onNone: () => [], onSome: (found) => [[name, found] as const] }),
      ),
    ),
);

const ID_END = "]";

const LINE_START = 0;

const headOf = (line: string): string =>
  line.slice(LINE_START, line.indexOf(ID_END) + ID_END.length);

const FILE = 0;
const LINE = 1;

const partOf = (line: string, index: number): string => line.split(":")[index] ?? "";

const POSITION: Order.Order<string> = Order.combine(
  Order.mapInput(Order.String, (line: string) => partOf(line, FILE)),
  Order.mapInput(Order.Number, (line: string) => Number(partOf(line, LINE))),
);

const byPosition = (lines: readonly string[]): readonly string[] => Arr.sort(lines, POSITION);

const aiSlopLive = Effect.scoped(
  Effect.gen(function* test() {
    const fs = yield* FileSystem.FileSystem;
    const key = yield* Config.Redacted("OPENROUTER_API_KEY");
    const example = yield* fromRoot("example", "ai-slop");
    const cwd = yield* tempProject({
      "fail.ts": yield* fs.readFileString(`${example}/fail.ts`),
      "pass.ts": yield* fs.readFileString(`${example}/pass.ts`),
      "oxlint.config.ts": configSource({
        jsPlugins: [yield* fromRoot("dist", "ai-slop.mjs")],
        rules: enabled(AI_SLOP, aiSlopRules),
        settings: {
          [AI_SLOP]: { model: LIVE_MODEL, timeoutMs: LIVE_TIMEOUT_MS },
        },
      }),
    });
    const run = yield* oxlint(
      cwd,
      ["--format", "unix", "-c", "oxlint.config.ts", "fail.ts", "pass.ts"],
      { ...(yield* forwardedEnv), OPENROUTER_API_KEY: Redacted.value(key) },
    );
    yield* Effect.log(outputOf(run));
    deepStrictEqual(byPosition(reportedLines(run, AI_SLOP).map((line) => headOf(line))), EXPECTED);
  }),
);

const libraryTypeLive = Effect.scoped(
  Effect.gen(function* test() {
    const fs = yield* FileSystem.FileSystem;
    const key = yield* Config.Redacted("OPENROUTER_API_KEY");
    const example = yield* fromRoot("example", "ai-slop");
    const sources = yield* Effect.all(
      LIBRARY_TYPE_FILES.map((name) => fs.readFileString(`${example}/${name}`)),
    );
    const cwd = yield* tempProject({
      ...Object.fromEntries(Arr.zip(LIBRARY_TYPE_FILES, sources)),
      "oxlint.config.ts": configSource({
        jsPlugins: [yield* fromRoot("dist", "ai-slop.mjs")],
        rules: enabled(AI_SLOP, [duplicatesLibraryType]),
        settings: {
          [AI_SLOP]: { model: LIVE_MODEL, timeoutMs: LIVE_TIMEOUT_MS },
        },
      }),
    });
    const run = yield* oxlint(
      cwd,
      ["--format", "unix", "-c", "oxlint.config.ts", ...LIBRARY_TYPE_FILES],
      { ...(yield* forwardedEnv), OPENROUTER_API_KEY: Redacted.value(key) },
    );
    yield* Effect.log(outputOf(run));
    deepStrictEqual(
      byPosition(reportedLines(run, AI_SLOP).map((line) => headOf(line))),
      LIBRARY_TYPE_EXPECTED,
    );
  }),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "the ai-slop rules on Span-01 Lite",
  (it) => {
    it.effect(
      "report each planted habit in fail.ts and nothing in pass.ts",
      () => aiSlopLive,
      TIMEOUT,
    );
    it.effect(
      "report the Discord schemas copied by hand and none tied to the library's types or owned by the app",
      () => libraryTypeLive,
      TIMEOUT,
    );
  },
);

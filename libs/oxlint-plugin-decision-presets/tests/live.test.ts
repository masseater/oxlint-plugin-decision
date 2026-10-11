import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import type { DecisionRule } from "@r_masseater/oxlint-plugin-decision";
import { Array as Arr, Config, Effect, Option, Redacted } from "effect";

import { codeClaims } from "#src/code-claims.ts";
import { presets } from "#src/presets.ts";
import { testClaims } from "#src/test-claims.ts";

import {
  EXAMPLE_FILES,
  PLUGIN_NAME,
  TIMEOUT,
  configSource,
  enabled,
  exampleFiles,
  fromRoot,
  outputOf,
  oxlint,
  reportedLines,
  tempProject,
} from "./oxlint.ts";
import type { Services } from "./oxlint.ts";

const LIVE_MODEL = "openrouter/respan/span-01-lite";

const PROXY_ENV = [
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_ENV_PROXY",
  "SSL_CERT_FILE",
] as const;

const EXPECTED = {
  recommended: [
    "fail.js:1:1: [no-hardcoded-secrets]",
    "fail.js:7:3: [no-pii-in-logs]",
    "fail.js:12:8: [no-prompt-injection]",
  ],
  strict: [
    "fail.js:1:1: [no-hardcoded-secrets]",
    "fail.js:5:8: [name-matches-behavior]",
    "fail.js:7:3: [no-pii-in-logs]",
    "fail.js:12:8: [no-prompt-injection]",
    "fail.js:12:8: [untrusted-input-risk]",
  ],
  "review-only": ["fail.js:23:8: [domain-naming]", "fail.js:28:8: [prefer-schema-validation]"],
} as const;

type PresetEntry = keyof typeof EXPECTED;

const CLAIMS: ReadonlySet<DecisionRule> = new Set([...codeClaims, ...testClaims]);

const withoutClaims = (rules: readonly DecisionRule[]): readonly DecisionRule[] =>
  rules.filter((rule) => !CLAIMS.has(rule));

const PRESET_RULES = {
  recommended: withoutClaims(presets.recommended),
  strict: withoutClaims(presets.strict),
  "review-only": withoutClaims(presets.reviewOnly),
} as const satisfies Readonly<Record<PresetEntry, unknown>>;

const proxyEnv = Effect.map(
  Effect.all(PROXY_ENV.map((name) => Effect.orDie(Config.option(Config.String(name))))),
  (values) =>
    Object.fromEntries(
      Arr.zip(PROXY_ENV, values).flatMap(([name, value]) =>
        Option.match(value, { onNone: () => [], onSome: (found) => [[name, found] as const] }),
      ),
    ),
);

const ID_END = "]";
const LINE_START = 0;

const headOf = (line: string): string =>
  line.slice(LINE_START, line.indexOf(ID_END) + ID_END.length);

const presetLive = (preset: PresetEntry): Effect.Effect<void, unknown, Services> =>
  Effect.scoped(
    Effect.gen(function* test() {
      const key = yield* Config.Redacted("OPENROUTER_API_KEY");
      const plugin = yield* fromRoot("dist", `${preset}.mjs`);
      const cwd = yield* tempProject({
        ...(yield* exampleFiles),
        "oxlint.config.ts": configSource({
          jsPlugins: [plugin],
          settings: { [PLUGIN_NAME]: { model: LIVE_MODEL, ci: "fail" } },
          rules: enabled(PLUGIN_NAME, PRESET_RULES[preset]),
        }),
      });
      const run = yield* oxlint(
        cwd,
        ["--format", "unix", "-c", "oxlint.config.ts", ...EXAMPLE_FILES],
        {
          ...(yield* proxyEnv),
          OPENROUTER_API_KEY: Redacted.value(key),
        },
      );
      yield* Effect.log(outputOf(run));
      deepStrictEqual(
        reportedLines(run, PLUGIN_NAME)
          .map((line) => headOf(line))
          .toSorted((left, right) => left.localeCompare(right)),
        [...EXPECTED[preset]].toSorted((left, right) => left.localeCompare(right)),
      );
    }),
  );

layer(NodeServices.layer, { excludeTestServices: true })("the presets on Span-01 Lite", (it) => {
  it.effect(
    "recommended reports exactly the risky lines of the example",
    () => presetLive("recommended"),
    TIMEOUT,
  );
  it.effect(
    "strict reports exactly the risky lines of the example",
    () => presetLive("strict"),
    TIMEOUT,
  );
  it.effect(
    "review-only reports exactly the lines worth a review",
    () => presetLive("review-only"),
    TIMEOUT,
  );
});

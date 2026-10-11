import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, FileSystem, Option, Order, Schema } from "effect";

import { FAILED, TIMEOUT, outputOf, withMock } from "./fixtures.ts";
import type { MockTest } from "./fixtures.ts";
import {
  LARGE_SOURCE,
  SOURCE,
  cacheEntries,
  fileRule,
  lineOf,
  locationProject,
} from "./location-fixture.ts";
import { loggedRequests } from "./mock-openrouter.ts";
import { firstSpan } from "./oxlint.ts";

const FIRST_LINE = 1;
const CALL_LINE = 4;
const REFINED_LINE = 604;
const NONE = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const SHORT_TIMEOUT_MS = 5000;

interface FailedRefinement {
  readonly ci: "fail" | "skip";
  readonly token: string;
  readonly reason: string;
  readonly reported: number;
}

interface MissingOnce {
  readonly token: string;
  readonly text: string;
  readonly line: number;
  readonly requests: number;
}

const refines = Effect.scoped(
  Effect.gen(function* test() {
    const project = yield* locationProject({ text: LARGE_SOURCE });
    const first = yield* project.lint;
    strictEqual(first.run.status, FAILED);
    deepStrictEqual(lineOf(first.diagnostics), Option.some(REFINED_LINE));
    const states = (yield* loggedRequests).map(({ body }) => JSON.stringify(body.state));
    strictEqual(new Set(states).size, ONE);
    deepStrictEqual((yield* project.lint).diagnostics, first.diagnostics);
    strictEqual((yield* loggedRequests).length, TWO);
  }),
);

const keepsLaterFindings = Effect.scoped(
  Effect.gen(function* test() {
    const project = yield* locationProject({
      text: LARGE_SOURCE,
      options: { rules: [fileRule, { ...fileRule, id: "another-file-rule" }] },
      token: "refinement-fails",
    });
    const { run, diagnostics } = yield* project.lint;
    strictEqual(run.status, FAILED);
    deepStrictEqual(
      diagnostics.map((diagnostic) => [
        diagnostic.message
          .split("]", ONE)
          .join("")
          .replace(/: http 401: .* while/u, ": http 401 while"),
        firstSpan(diagnostic).line,
      ]),
      [
        ["[no-personal-data", FIRST_LINE],
        ["[another-file-rule", FIRST_LINE],
        [
          "oxlint-plugin-decision: http 401 while refining the location of [no-personal-data",
          FIRST_LINE,
        ],
      ],
    );
    strictEqual((yield* loggedRequests).length, TWO);
  }),
);

const failedRefinements: readonly FailedRefinement[] = [
  { ci: "fail", token: "refinement-fails", reason: "401", reported: TWO },
  { ci: "fail", token: "refinement-slow", reason: "timeout", reported: TWO },
  { ci: "skip", token: "refinement-fails", reason: "401", reported: ONE },
  { ci: "skip", token: "refinement-slow", reason: "timeout", reported: ONE },
];

const preservesFinding = ({ ci, token, reason, reported }: FailedRefinement): MockTest =>
  Effect.scoped(
    Effect.gen(function* test() {
      const project = yield* locationProject({
        text: LARGE_SOURCE,
        options: { ci, timeoutMs: SHORT_TIMEOUT_MS },
        token,
      });
      const { run, diagnostics } = yield* project.lint;
      strictEqual(run.status, FAILED, outputOf(run));
      deepStrictEqual(lineOf(diagnostics), Option.some(FIRST_LINE));
      assertInclude(outputOf(run), reason);
      strictEqual(diagnostics.length, reported);
      strictEqual((yield* loggedRequests).length, TWO);
    }),
  );

const missingOnce: readonly MissingOnce[] = [
  { token: "location-missing-once", text: SOURCE, line: CALL_LINE, requests: TWO },
  { token: "refinement-missing-once", text: LARGE_SOURCE, line: REFINED_LINE, requests: THREE },
];

const retriesMalformed = ({ token, text, line, requests }: MissingOnce): MockTest =>
  Effect.scoped(
    Effect.gen(function* test() {
      const project = yield* locationProject({ text, token });
      deepStrictEqual(lineOf((yield* project.lint).diagnostics), Option.some(FIRST_LINE));
      deepStrictEqual(lineOf((yield* project.lint).diagnostics), Option.some(line));
      strictEqual((yield* loggedRequests).length, requests);
    }),
  );

const CachedAnswers = Schema.fromJsonString(
  Schema.Struct({ answers: Schema.Record(Schema.String, Schema.Unknown) }),
);

const corruptRefinement = (file: string): Effect.Effect<number, unknown, FileSystem.FileSystem> =>
  Effect.gen(function* corrupt() {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(file);
    const entry = yield* Schema.decodeUnknownEffect(CachedAnswers)(raw);
    if (Object.hasOwn(entry.answers, "s0")) {
      return NONE;
    }
    const answers = { ...entry.answers, s0_location: { type: "choice", choice: "L604" } };
    yield* fs.writeFileString(file, JSON.stringify({ ...JSON.parse(raw), answers }));
    return ONE;
  });

const retriesCorruptCache = Effect.scoped(
  Effect.gen(function* test() {
    const project = yield* locationProject({ text: LARGE_SOURCE });
    deepStrictEqual(lineOf((yield* project.lint).diagnostics), Option.some(REFINED_LINE));
    const corrupted = yield* Effect.all(
      (yield* cacheEntries(project.cwd)).map((file) => corruptRefinement(file)),
    );
    deepStrictEqual(Arr.sort(corrupted, Order.Number), [NONE, ONE]);
    deepStrictEqual(lineOf((yield* project.lint).diagnostics), Option.some(REFINED_LINE));
    strictEqual((yield* loggedRequests).length, THREE);
  }),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "refining a large file's location",
  (it) => {
    it.effect(
      "narrows a range with full context and caches both requests",
      () => withMock(refines),
      TIMEOUT,
    );
    it.effect(
      "keeps later findings when a refinement fails, without more requests",
      () => withMock(keepsLaterFindings),
      TIMEOUT,
    );
    it.effect.each(failedRefinements)(
      "keeps the finding when refinement fails (%o)",
      (failure) => withMock(preservesFinding(failure)),
      TIMEOUT,
    );
    it.effect.each(missingOnce)(
      "retries a malformed location answer on the next run (%o)",
      (missing) => withMock(retriesMalformed(missing)),
      TIMEOUT,
    );
    it.effect(
      "retries malformed refinement answers already on disk",
      () => withMock(retriesCorruptCache),
      TIMEOUT,
    );
  },
);

import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { assertInclude, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Array as Arr, Effect, Option } from "effect";

import { FAILED, PASSED, TIMEOUT, withMock } from "./fixtures.ts";
import type { MockTest } from "./fixtures.ts";
import {
  LARGE_SOURCE,
  LOG_CALL,
  SOURCE,
  fileRule,
  lineOf,
  locationProject,
  spanOf,
} from "./location-fixture.ts";
import { loggedRequests } from "./mock-openrouter.ts";
import type { OxlintDiagnostic } from "./oxlint.ts";

const FIRST_LINE = 1;
const CALL_LINE = 4;
const CALL_COLUMN = 2;
const TRUNCATE_AFTER_CALL = 10;
const ONE = 1;
const START = 0;
const LINE_SEPARATOR_CODE = 0x20_28;
const PARAGRAPH_SEPARATOR_CODE = 0x20_29;
const LINE_SEPARATOR = String.fromCodePoint(LINE_SEPARATOR_CODE);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(PARAGRAPH_SEPARATOR_CODE);

interface Truncation {
  readonly ci: "fail" | "skip";
  readonly maxSnippetChars: number;
}

const byteOffset = (text: string): number =>
  new TextEncoder().encode(text.slice(START, text.indexOf("console"))).length;

const firstSnippet = loggedRequests.pipe(
  Effect.map((requests) =>
    Arr.head(requests).pipe(
      Option.flatMap(({ body }) => Option.fromUndefinedOr(body.state.snippets["s0"])),
    ),
  ),
);

const questionIds = loggedRequests.pipe(
  Effect.map((requests) =>
    Arr.head(requests).pipe(Option.map(({ body }) => Object.keys(body.questions))),
  ),
);

const spanAcross = (newline: string): MockTest<readonly OxlintDiagnostic[]> =>
  Effect.scoped(
    Effect.gen(function* test() {
      const text = SOURCE.replaceAll("\n", newline);
      const { run, diagnostics } = yield* (yield* locationProject({ text })).lint;
      strictEqual(run.status, FAILED, `${run.stdout}${run.stderr}`);
      const span = spanOf(diagnostics).pipe(
        Option.map(({ offset, length }) => ({ offset, length })),
      );
      deepStrictEqual(span, Option.some({ offset: byteOffset(text), length: LOG_CALL.length }));
      strictEqual((yield* loggedRequests).length, ONE);
      assertInclude(
        Option.getOrElse(yield* firstSnippet, () => ""),
        "L4| \tconsole.log",
      );
      return diagnostics;
    }),
  );

const lineAndColumn = (newline: string): MockTest =>
  Effect.gen(function* test() {
    const diagnostics = yield* spanAcross(newline);
    deepStrictEqual(
      spanOf(diagnostics).pipe(Option.map(({ line, column }) => ({ line, column }))),
      Option.some({ line: CALL_LINE, column: CALL_COLUMN }),
    );
  });

const withoutLocation = Effect.scoped(
  Effect.gen(function* test() {
    const { location: _location, ...rule } = fileRule;
    const { diagnostics } = yield* (yield* locationProject({ options: { rules: [rule] } })).lint;
    deepStrictEqual(lineOf(diagnostics), Option.some(FIRST_LINE));
    deepStrictEqual(yield* firstSnippet, Option.some(SOURCE));
    deepStrictEqual(yield* questionIds, Option.some(["s0"]));
  }),
);

const truncations: readonly Truncation[] = (["fail", "skip"] as const).flatMap((ci) =>
  [
    SOURCE.indexOf("console") + TRUNCATE_AFTER_CALL,
    SOURCE.indexOf("\tconsole"),
    SOURCE.length - ONE,
  ].map((maxSnippetChars) => ({ ci, maxSnippetChars })),
);

const neverLocatesTruncated = ({ ci, maxSnippetChars }: Truncation): MockTest =>
  Effect.scoped(
    Effect.gen(function* test() {
      const project = yield* locationProject({
        options: { ci, maxSnippetChars },
        token: "location-always-positive",
      });
      const { run, diagnostics } = yield* project.lint;
      strictEqual(run.status, FAILED, `${run.stdout}${run.stderr}`);
      deepStrictEqual(diagnostics.length, ONE);
      deepStrictEqual(lineOf(diagnostics), Option.some(FIRST_LINE));
      deepStrictEqual(yield* questionIds, Option.some(["s0"]));
    }),
  );

const cachesUncertain = (token: string): MockTest =>
  Effect.scoped(
    Effect.gen(function* test() {
      const project = yield* locationProject({ token });
      const first = yield* project.lint;
      deepStrictEqual(lineOf(first.diagnostics), Option.some(FIRST_LINE));
      deepStrictEqual((yield* project.lint).diagnostics, first.diagnostics);
      strictEqual((yield* loggedRequests).length, ONE);
    }),
  );

const noViolation = Effect.scoped(
  Effect.gen(function* test() {
    const project = yield* locationProject({ text: LARGE_SOURCE, token: "location-no-violation" });
    const { run, diagnostics } = yield* project.lint;
    strictEqual(run.status, PASSED, `${run.stdout}${run.stderr}`);
    deepStrictEqual(diagnostics, []);
    strictEqual((yield* loggedRequests).length, ONE);
  }),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "locating a file rule's violation",
  (it) => {
    it.effect.each(["\n", "\r\n", "\r"])(
      "reports the source line across %j",
      (newline) => withMock(lineAndColumn(newline)),
      TIMEOUT,
    );
    it.effect.each([LINE_SEPARATOR, PARAGRAPH_SEPARATOR])(
      "reports the source span across %j",
      (newline) => withMock(Effect.asVoid(spanAcross(newline))),
      TIMEOUT,
    );
    it.effect(
      "keeps the file-level report without a location question",
      () => withMock(withoutLocation),
      TIMEOUT,
    );
    it.effect.each(truncations)(
      "never locates a truncated snippet (%o)",
      (truncation) => withMock(neverLocatesTruncated(truncation)),
      TIMEOUT,
    );
    it.effect.each(["location-uncertain", "location-unknown"])(
      "caches an uncertain answer and reports at file level (%s)",
      (token) => withMock(cachesUncertain(token)),
      TIMEOUT,
    );
    it.effect(
      "does not let a confident location create a violation",
      () => withMock(noViolation),
      TIMEOUT,
    );
  },
);

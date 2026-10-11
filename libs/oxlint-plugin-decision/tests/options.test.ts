import { layer } from "@effect/vitest";
import { deepStrictEqual, strictEqual, throws } from "@effect/vitest/utils";
import { Effect, Layer } from "effect";

import { openRouter } from "#src/openrouter.ts";
import {
  DEFAULTS,
  NAMED_PARENTS,
  REPORT_LOC,
  resolveOptions,
  snippetNodeFor,
} from "#src/options.ts";
import type { AstNode, DecisionRule } from "#src/types.ts";

const SIGNATURE_LINE = 10;
const SIGNATURE_COLUMN = 7;
const END_LINE = 16;
const CALL_LINE = 3;
const CALL_START = 2;
const CALL_END = 9;
const FIRST_LINE = 1;
const START = 0;

const rule: DecisionRule = { id: "a", target: "call", question: "Is it bad?", cutoff: 0.8 };
const providers = { openrouter: openRouter };

const noSettings = { options: {}, settings: undefined };

const resolvesDefaults = Effect.sync(() => {
  const { rules } = resolveOptions(noSettings, [rule], providers);
  deepStrictEqual(
    rules.map(({ models, answer }) => ({
      models: models.map(({ id, model }) => ({ id, model })),
      answer,
    })),
    [
      {
        models: [{ id: DEFAULTS.model, model: "~typesafe/jev-latest" }],
        answer: { kind: "boolean" },
      },
    ],
  );
});

const settingsOverrideCode = Effect.sync(() => {
  const resolved = resolveOptions(
    { options: { model: "openrouter/code", timeoutMs: 5 }, settings: { model: "openrouter/config" } },
    [rule],
    providers,
  );
  deepStrictEqual(
    [resolved.timeoutMs, resolved.rules.flatMap(({ models }) => models.map(({ model }) => model))],
    [5, ["config"]],
  );
});

const refusesEmpty = Effect.sync(() => {
  throws(() => {
    resolveOptions(noSettings, [], providers);
  });
});

const dedupesModels = Effect.sync(() => {
  const resolved = resolveOptions(
    { options: { model: ["openrouter/x", "openrouter/x", "openrouter/y"] }, settings: undefined },
    [rule],
    providers,
  );
  deepStrictEqual(
    resolved.rules.flatMap(({ models }) => models.map(({ model }) => model)),
    ["x", "y"],
  );
});

const node = (type: string): AstNode => ({
  type,
  range: [START, START],
  loc: { start: { line: FIRST_LINE, column: START }, end: { line: FIRST_LINE, column: START } },
});

const namesAnonymousFunctions = Effect.sync(() => {
  const results = Object.entries(NAMED_PARENTS).map(([parentType, field]) => {
    const parent: { -readonly [Key in keyof AstNode]: AstNode[Key] } = node(parentType);
    const child: AstNode = { ...node("ArrowFunctionExpression"), parent };
    parent[field] = child;
    return snippetNodeFor(child) === parent;
  });
  deepStrictEqual(results, [true, true, true, true]);
  const lone: AstNode = { ...node("ArrowFunctionExpression"), parent: node("CallExpression") };
  strictEqual(snippetNodeFor(lone), lone);
});

const reportLocations = Effect.sync(() => {
  const fn: AstNode = {
    ...node("FunctionDeclaration"),
    loc: {
      start: { line: SIGNATURE_LINE, column: SIGNATURE_COLUMN },
      end: { line: END_LINE, column: FIRST_LINE },
    },
  };
  const signature = "function readConfig(path) {";
  deepStrictEqual(REPORT_LOC.function(fn, `${signature}\n  return 1;\n}`), {
    start: { line: SIGNATURE_LINE, column: SIGNATURE_COLUMN },
    end: { line: SIGNATURE_LINE, column: SIGNATURE_COLUMN + signature.length },
  });
  deepStrictEqual(REPORT_LOC.file(fn, 'import x from "y";\n\nx();').end, {
    line: FIRST_LINE,
    column: 'import x from "y";'.length,
  });
  const loc = {
    start: { line: CALL_LINE, column: CALL_START },
    end: { line: CALL_LINE, column: CALL_END },
  };
  strictEqual(REPORT_LOC.jsx({ ...node("JSXElement"), openingElement: { loc } }), loc);
});

layer(Layer.empty)("resolving options", (it) => {
  it.effect("fills the default model and a boolean answer", () => resolvesDefaults);
  it.effect("lets oxlint settings override the plugin's own options", () => settingsOverrideCode);
  it.effect("refuses a plugin with no rules", () => refusesEmpty);
  it.effect("asks each listed model once", () => dedupesModels);
  it.effect(
    "sends the binding for an anonymous function stored under a name",
    () => namesAnonymousFunctions,
  );
  it.effect(
    "reports functions on their signature, files on line 1, JSX on its opening tag",
    () => reportLocations,
  );
});

import { Effect } from "effect";
import type { PlatformError } from "effect/PlatformError";

import type { DecisionPluginSetup, DecisionRule } from "#src/types.ts";

import { MockOpenRouterLayer } from "./mock-openrouter.ts";
import type { LoggedRequest, MockOpenRouter } from "./mock-openrouter.ts";
import { packageRoot, projectFilesFor, runOxlint, writeProject } from "./oxlint.ts";
import type { OxlintRun, Services } from "./oxlint.ts";

type Env = Readonly<Record<string, string>>;

type MockTest<Value = void> = Effect.Effect<Value, unknown, Services | MockOpenRouter>;

const TIMEOUT = 120_000;
const PASSED = 0;
const FAILED = 1;

const callRule: DecisionRule = {
  id: "any-call",
  target: "call",
  question: "Does this call write personal data to a log?",
  cutoff: 0.8,
};

const lintExample = (
  env: Env,
  format = "unix",
): Effect.Effect<OxlintRun, PlatformError, Services> =>
  Effect.gen(function* lint() {
    const cwd = yield* packageRoot;
    return yield* runOxlint({
      cwd,
      args: ["--format", format, "-c", "example/.oxlintrc.json", "example/"],
      env,
    });
  });

interface ProjectRun {
  readonly files: Env;
  readonly options: DecisionPluginSetup;
  readonly env: Env;
  readonly format?: string;
}

const lintProject = ({
  files,
  options,
  env,
  format = "unix",
}: ProjectRun): Effect.Effect<OxlintRun, PlatformError, Services> =>
  Effect.scoped(
    Effect.gen(function* lint() {
      const project = yield* projectFilesFor(options);
      const cwd = yield* writeProject({ ...files, ...project });
      return yield* runOxlint({
        cwd,
        args: ["--format", format, "-c", ".oxlintrc.json", ...Object.keys(files)],
        env,
      });
    }),
  );

const questionCount = (request: LoggedRequest): number =>
  Object.keys(request.body.questions).length;

const modelOf = (request: LoggedRequest): string => request.body.model;

const withMock = (
  effect: Effect.Effect<void, unknown, MockOpenRouter | Services>,
): Effect.Effect<void, unknown, Services> => effect.pipe(Effect.provide(MockOpenRouterLayer));

const outputOf = (run: OxlintRun): string => `${run.stdout}${run.stderr}`;

export {
  FAILED,
  PASSED,
  TIMEOUT,
  callRule,
  lintExample,
  lintProject,
  modelOf,
  outputOf,
  questionCount,
  withMock,
};
export type { Env, MockTest, ProjectRun };

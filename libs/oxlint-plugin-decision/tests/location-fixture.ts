import { Array as Arr, Effect, FileSystem, Option, Path } from "effect";
import type { Scope } from "effect";

import type { DecisionPluginSetup, DecisionRule } from "#src/types.ts";

import type { MockOpenRouter } from "./mock-openrouter.ts";
import {
  cacheDirOf,
  diagnosticsOf,
  firstSpan,
  mockEnv,
  projectFilesFor,
  runOxlint,
  writeProject,
} from "./oxlint.ts";
import type { OxlintDiagnostic, OxlintRun, OxlintSpan, Services } from "./oxlint.ts";

const SOURCE =
  "// Context 🐱\nexport function logUser(user) {\n\n\tconsole.log(user.email, user.phone);  \n}\n";
const PADDING_LINES = 600;
const LARGE_SOURCE = `${"// Context\n".repeat(PADDING_LINES)}${SOURCE}`;
const LOG_CALL = "console.log(user.email, user.phone);";
const MAX_SNIPPET_CHARS = 64_000;

const fileRule: DecisionRule = {
  id: "no-personal-data",
  target: "file",
  question: "Does this file log personal data?",
  cutoff: 0.9,
  location: { question: "Select the call that logs personal data.", cutoff: 0.8 },
};

interface Linted {
  readonly run: OxlintRun;
  readonly diagnostics: readonly OxlintDiagnostic[];
}

interface LocationProject {
  readonly cwd: string;
  readonly lint: Effect.Effect<Linted, unknown, Services>;
}

interface ProjectSetup {
  readonly text?: string;
  readonly options?: Partial<DecisionPluginSetup>;
  readonly token?: string;
}

const ARGS = [
  "--threads=1",
  "--disable-nested-config",
  "--format=json",
  "-c",
  "oxlint.config.ts",
  "source.ts",
];

const locationProject = ({
  text = SOURCE,
  options = {},
  token = "test-key",
}: ProjectSetup): Effect.Effect<
  LocationProject,
  unknown,
  Services | MockOpenRouter | Scope.Scope
> =>
  Effect.gen(function* setup() {
    const project = yield* projectFilesFor({
      ci: "fail",
      maxSnippetChars: MAX_SNIPPET_CHARS,
      rules: [fileRule],
      ...options,
    });
    const cwd = yield* writeProject({ "source.ts": text, ...project });
    const env = { ...(yield* mockEnv(token)), CI: "1" };
    const lint = Effect.gen(function* lintOnce() {
      const run = yield* runOxlint({ cwd, args: ARGS, env });
      return { run, diagnostics: yield* diagnosticsOf(run) };
    });
    return { cwd, lint };
  });

const lineOf = (diagnostics: readonly OxlintDiagnostic[]): Option.Option<number> =>
  Arr.head(diagnostics).pipe(Option.map((diagnostic) => firstSpan(diagnostic).line));

const spanOf = (diagnostics: readonly OxlintDiagnostic[]): Option.Option<OxlintSpan> =>
  Arr.head(diagnostics).pipe(Option.map((diagnostic) => firstSpan(diagnostic)));

const cacheEntries = (
  cwd: string,
): Effect.Effect<readonly string[], unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* entries() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* cacheDirOf(cwd);
    const names = yield* fs.readDirectory(dir);
    return names.map((name) => path.join(dir, name));
  });

export { LARGE_SOURCE, LOG_CALL, SOURCE, cacheEntries, fileRule, lineOf, locationProject, spanOf };
export type { Linted, LocationProject, ProjectSetup };

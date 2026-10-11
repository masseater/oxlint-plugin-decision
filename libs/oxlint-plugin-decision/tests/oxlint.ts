import { Array as Arr, Config, Effect, FileSystem, Option, Path, Schema, Stream } from "effect";
import type { Scope } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/process";
import type { ChildProcessSpawner } from "effect/process";

import type { DecisionPluginSetup } from "#src/types.ts";

import { MockOpenRouter } from "./mock-openrouter.ts";

interface OxlintRun {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface OxlintCall {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

type Services = FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner;

const PASSED_ENV = [
  "PATH",
  "HOME",
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_ENV_PROXY",
  "SSL_CERT_FILE",
] as const;

const DECISION_PLUGINS = ["decision", "team"] as const;

const CACHE_SEGMENTS = ["node_modules", ".cache", "oxlint-plugin-decision"] as const;

const inPackage = (...segments: readonly string[]): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function* resolve() {
    const path = yield* Path.Path;
    return path.join(path.dirname(import.meta.dirname), ...segments);
  });

const packageRoot = inPackage();
const pluginPath = inPackage("dist", "index.mjs");
const cacheDirOf = (root: string): Effect.Effect<string, never, Path.Path> =>
  Path.Path.pipe(Effect.map((path) => path.join(root, ...CACHE_SEGMENTS)));

const inheritedEnv: Effect.Effect<Readonly<Record<string, string>>> = Effect.map(
  Effect.all(PASSED_ENV.map((name) => Effect.orDie(Config.option(Config.String(name))))),
  (values) =>
    Object.fromEntries(
      Arr.zip(PASSED_ENV, values).flatMap(([name, value]) =>
        Option.match(value, { onNone: () => [], onSome: (found) => [[name, found] as const] }),
      ),
    ),
);

const textOf = <Err, Req>(
  stream: Stream.Stream<Uint8Array, Err, Req>,
): Effect.Effect<string, Err, Req> => stream.pipe(Stream.decodeText(), Stream.mkString);

const runOxlint = ({
  cwd,
  args,
  env,
}: OxlintCall): Effect.Effect<OxlintRun, PlatformError, Services> =>
  Effect.scoped(
    Effect.gen(function* run() {
      const bin = yield* inPackage("node_modules", "oxlint", "bin", "oxlint");
      const inherited = yield* inheritedEnv;
      const handle = yield* ChildProcess.make(bin, args, {
        cwd,
        env: { ...inherited, ...env },
        extendEnv: false,
      });
      const [stdout, stderr, status] = yield* Effect.all(
        [textOf(handle.stdout), textOf(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      );
      return { stdout, stderr, status: Number(status) };
    }),
  );

const removeCache = (root: string): Effect.Effect<void, PlatformError, Services> =>
  Effect.gen(function* remove() {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(yield* cacheDirOf(root), { recursive: true, force: true });
  });

const writeProject = (
  files: Readonly<Record<string, string>>,
): Effect.Effect<string, PlatformError, Services | Scope.Scope> =>
  Effect.gen(function* write() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "decision-" });
    yield* Effect.forEach(Object.entries(files), ([name, content]) =>
      fs.writeFileString(path.join(dir, name), content),
    );
    return dir;
  });

const ruleEntry = (options: object | undefined): unknown =>
  Option.match(Option.fromUndefinedOr(options), {
    onNone: () => "error",
    onSome: (value) => ["error", value],
  });

const projectFilesFor = (
  setup: DecisionPluginSetup,
  ruleOptions: Readonly<Record<string, object>> = {},
): Effect.Effect<Readonly<Record<string, string>>, never, Path.Path> =>
  pluginPath.pipe(
    Effect.map((plugin) => ({
      "plugin.mjs": `import { createDecisionPlugin } from ${JSON.stringify(plugin)};\n\nexport default createDecisionPlugin(${JSON.stringify(setup)});\n`,
      ".oxlintrc.json": JSON.stringify({
        jsPlugins: ["./plugin.mjs"],
        rules: Object.fromEntries(
          setup.rules.map(({ id }) => [`decision/${id}`, ruleEntry(ruleOptions[id])]),
        ),
      }),
    })),
  );

const mockEnv = (
  token: string,
): Effect.Effect<Readonly<Record<string, string>>, never, MockOpenRouter> =>
  MockOpenRouter.pipe(
    Effect.map(({ baseURL }) => ({ OPENROUTER_API_KEY: token, OPENROUTER_BASE_URL: baseURL })),
  );

const decisionLines = (run: OxlintRun): readonly string[] =>
  run.stdout
    .split("\n")
    .filter((line) => DECISION_PLUGINS.some((name) => line.includes(`/${name}(`)));

const Span = Schema.Struct({
  offset: Schema.Number,
  line: Schema.Number,
  column: Schema.Number,
  length: Schema.Number,
});

const Diagnostic = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  labels: Schema.Array(Schema.Struct({ span: Span })),
});

const Report = Schema.fromJsonString(Schema.Struct({ diagnostics: Schema.Array(Diagnostic) }));

type OxlintDiagnostic = typeof Diagnostic.Type;
type OxlintSpan = typeof Span.Type;

const diagnosticsOf = (
  run: OxlintRun,
): Effect.Effect<readonly OxlintDiagnostic[], Schema.SchemaError> =>
  Schema.decodeUnknownEffect(Report)(run.stdout).pipe(
    Effect.map(({ diagnostics }) =>
      diagnostics.filter((diagnostic) =>
        DECISION_PLUGINS.some((name) => diagnostic.code.startsWith(`${name}(`)),
      ),
    ),
  );

const firstSpan = (diagnostic: OxlintDiagnostic): OxlintSpan =>
  Option.getOrThrow(Arr.head(diagnostic.labels)).span;

export {
  cacheDirOf,
  decisionLines,
  diagnosticsOf,
  firstSpan,
  mockEnv,
  packageRoot,
  pluginPath,
  projectFilesFor,
  removeCache,
  runOxlint,
  writeProject,
};
export type { OxlintCall, OxlintDiagnostic, OxlintRun, OxlintSpan, Services };

import { Array as Arr, Config, Effect, FileSystem, Option, Path, Stream } from "effect";
import type { Scope } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess } from "effect/process";
import type { ChildProcessSpawner } from "effect/process";

import strictPlugin from "#src/strict.ts";

type Services = FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner;

type Env = Readonly<Record<string, string>>;

interface Run {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const TIMEOUT = 120_000;
const PASSED = 0;
const FAILED = 1;

const presetsRoot = Path.Path.pipe(Effect.map((path) => path.dirname(import.meta.dirname)));

const fromRoot = (...segments: readonly string[]): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function* join() {
    const path = yield* Path.Path;
    return path.join(yield* presetsRoot, ...segments);
  });

const textOf = <Err, Req>(
  stream: Stream.Stream<Uint8Array, Err, Req>,
): Effect.Effect<string, Err, Req> => stream.pipe(Stream.decodeText(), Stream.mkString);

const oxlint = (
  cwd: string,
  args: readonly string[],
  env: Env,
): Effect.Effect<Run, PlatformError, Services> =>
  Effect.scoped(
    Effect.gen(function* run() {
      const bin = yield* fromRoot("node_modules", "oxlint", "bin", "oxlint");
      const PATH = yield* Effect.orDie(Config.String("PATH"));
      const coverage = yield* Effect.orDie(Config.option(Config.String("NODE_V8_COVERAGE")));
      const handle = yield* ChildProcess.make(bin, args, {
        cwd,
        env: {
          PATH,
          ...Option.match(coverage, {
            onNone: () => ({}),
            onSome: (dir) => ({ NODE_V8_COVERAGE: dir }),
          }),
          ...env,
        },
        extendEnv: false,
      });
      const [stdout, stderr, status] = yield* Effect.all(
        [textOf(handle.stdout), textOf(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      );
      return { stdout, stderr, status: Number(status) };
    }),
  );

const tempProject = (files: Env): Effect.Effect<string, PlatformError, Services | Scope.Scope> =>
  Effect.gen(function* write() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "decision-presets-" });
    yield* Effect.forEach(Object.entries(files), ([name, content]) =>
      fs.writeFileString(path.join(dir, name), content),
    );
    return dir;
  });

const configSource = (config: object): string => `export default ${JSON.stringify(config)};\n`;

const PLUGIN_NAME = strictPlugin.meta.name;

const EXAMPLE_FILES = ["fail.js", "pass.js"] as const;

const exampleFiles: Effect.Effect<Env, PlatformError, Services> = Effect.gen(function* read() {
  const fs = yield* FileSystem.FileSystem;
  const contents = yield* Effect.all(
    EXAMPLE_FILES.map((name) =>
      Effect.flatMap(fromRoot("example", name), (file) => fs.readFileString(file)),
    ),
  );
  return Object.fromEntries(Arr.zip(EXAMPLE_FILES, contents));
});

const reportedLines = (run: Run, plugin: string): readonly string[] =>
  run.stdout.split("\n").filter((line) => line.includes(`/${plugin}(`));

const enabled = (
  plugin: string,
  rules: readonly { readonly id: string }[],
): Readonly<Record<string, string>> =>
  Object.fromEntries(rules.map(({ id }) => [`${plugin}/${id}`, "error"]));

const LIVE_MODEL = "openrouter/respan/span-01-lite";

const FORWARDED = [
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_ENV_PROXY",
  "SSL_CERT_FILE",
] as const;

const forwardedEnv: Effect.Effect<Env> = Effect.map(
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

const outputOf = (run: Run): string => `${run.stdout}${run.stderr}`;

export {
  EXAMPLE_FILES,
  FAILED,
  LIVE_MODEL,
  PASSED,
  PLUGIN_NAME,
  TIMEOUT,
  configSource,
  enabled,
  exampleFiles,
  forwardedEnv,
  fromRoot,
  headOf,
  outputOf,
  oxlint,
  reportedLines,
  tempProject,
};
export type { Env, Run, Services };

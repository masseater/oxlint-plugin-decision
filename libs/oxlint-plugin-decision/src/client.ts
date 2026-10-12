import { OpenRouter } from "@openrouter/sdk";
import { HTTPClient } from "@openrouter/sdk/lib/http.js";
import { Array as Arr, Config, Effect, FileSystem, Option, Path, String as Str } from "effect";

const TOOL = "oxlint-plugin-decision";
const GITHUB = "https://github.com";
const SELF = "masseater/oxlint-plugin-decision";
const GIT_SUFFIX = /\.git\/?$/u;
const SEPARATORS = /[/:]/u;
const SLUG_PARTS = 2;
const GITDIR = /^gitdir:\s*(?<dir>.+)$/mu;
const ORIGIN_URL = /\[remote "origin"\][^[]*?\burl\s*=\s*(?<url>\S+)/u;

const hiddenApp = (): HTTPClient =>
  new HTTPClient().addHook("beforeRequest", (request) => {
    request.headers.set("X-OpenRouter-App-Visibility", "hidden");
  });

const isSet = (name: string): Effect.Effect<boolean> =>
  Config.option(Config.NonEmptyString(name)).pipe(
    Effect.map(Option.isSome),
    Effect.orElseSucceed(() => false),
  );

const contextOf = Effect.gen(function* contextOf() {
  if (yield* isSet("GITHUB_ACTIONS")) {
    return "github-actions";
  }
  if (yield* isSet("CLAUDE_CODE_REMOTE")) {
    return "claude-code-cloud";
  }
  if (yield* isSet("CLAUDECODE")) {
    return "claude-code";
  }
  return "local";
});

const slugOf = (url: string): Option.Option<string> => {
  const parts = url
    .trim()
    .replace(GIT_SUFFIX, "")
    .split(SEPARATORS)
    .filter((part) => Str.isNonEmpty(part));
  if (parts.length < SLUG_PARTS) {
    return Option.none();
  }
  return Option.some(Arr.takeRight(parts, SLUG_PARTS).join("/"));
};

const captured = (match: Option.Option<RegExpMatchArray>, name: string): Option.Option<string> =>
  match.pipe(
    Option.flatMap((found) => Option.fromNullishOr(found.groups)),
    Option.flatMap((groups) => Option.fromNullishOr(groups[name])),
  );

const linkedGitDir = Effect.fn("linkedGitDir")(function* linkedGitDir(dir: string, dotGit: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(dotGit);
  return captured(Str.match(GITDIR)(text), "dir").pipe(
    Option.map((found) => path.resolve(dir, found.trim())),
  );
});

type ClientServices = FileSystem.FileSystem | Path.Path;

const gitDirAt = Effect.fn("gitDirAt")(function* gitDirAt(dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dotGit = path.join(dir, ".git");
  const info = yield* fs.stat(dotGit).pipe(Effect.option);
  if (Option.isNone(info)) {
    return Option.none<string>();
  }
  if (info.value.type === "Directory") {
    return Option.some(dotGit);
  }
  return yield* linkedGitDir(dir, dotGit);
});

const gitDirFrom = (dir: string): Effect.Effect<Option.Option<string>, unknown, ClientServices> =>
  Effect.gen(function* walk() {
    const path = yield* Path.Path;
    const here = yield* gitDirAt(dir);
    const parent = path.dirname(dir);
    if (Option.isSome(here) || parent === dir) {
      return here;
    }
    return yield* gitDirFrom(parent);
  });

const commonDirOf = Effect.fn("commonDirOf")(function* commonDirOf(gitDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const common = yield* fs.readFileString(path.join(gitDir, "commondir")).pipe(Effect.option);
  return Option.match(common, {
    onNone: () => gitDir,
    onSome: (relative) => path.resolve(gitDir, relative.trim()),
  });
});

const remoteSlug = Effect.gen(function* remoteSlug() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const gitDir = yield* gitDirFrom(path.resolve("."));
  if (Option.isNone(gitDir)) {
    return Option.none<string>();
  }
  const config = yield* fs.readFileString(path.join(yield* commonDirOf(gitDir.value), "config"));
  return captured(Str.match(ORIGIN_URL)(config), "url").pipe(Option.flatMap(slugOf));
}).pipe(Effect.orElseSucceed(() => Option.none<string>()));

const repoOf = Effect.gen(function* repoOf() {
  const fromActions = yield* Config.option(Config.NonEmptyString("GITHUB_REPOSITORY")).pipe(
    Effect.orElseSucceed(() => Option.none<string>()),
  );
  if (Option.isSome(fromActions)) {
    return fromActions;
  }
  return yield* remoteSlug;
});

const attribution = Effect.gen(function* attribution() {
  const context = yield* contextOf;
  const repo = yield* repoOf;
  const slug = Option.getOrElse(repo, () => SELF);
  return {
    httpReferer: `${GITHUB}/${slug}/${TOOL}/${context}`,
    appTitle: `${Option.getOrElse(repo, () => "unknown")} ${context} ${TOOL}`,
    httpClient: hiddenApp(),
  };
}).pipe(Effect.cached, Effect.runSync);

const clientFor = (apiKey: string): Effect.Effect<OpenRouter, never, ClientServices> =>
  attribution.pipe(Effect.map((app) => new OpenRouter({ apiKey, ...app })));

export { clientFor };
export type { ClientServices };

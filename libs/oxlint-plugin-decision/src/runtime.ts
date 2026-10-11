import { Cause, Config, Console, Effect, Exit, Option, String as Str } from "effect";

import { PREFIX } from "./options.ts";
import type { ResolvedOptions } from "./types.ts";

const runOrElse = <Value>(
  effect: Effect.Effect<Value, unknown>,
  fallback: (error: unknown) => Value,
): Value =>
  Exit.match(Effect.runSyncExit(effect), {
    onSuccess: (value) => value,
    onFailure: (cause) => fallback(Cause.squash(cause)),
  });

const envOf = (name: string): Option.Option<string> =>
  runOrElse(
    Config.option(Config.NonEmptyString(name)),
    () => Option.none(),
  ).pipe(
    Option.map((value) => value.trim()),
    Option.filter(Str.isNonEmpty),
  );

const failsInCi = (options: ResolvedOptions): boolean =>
  options.ci === "fail" && Option.isSome(envOf("CI"));

const warned = new Set<string>();

const warnOnce = (reason: string, message: string): void => {
  if (warned.has(reason)) {
    return;
  }
  warned.add(reason);
  Effect.runFork(Console.warn(`${PREFIX}: ${message}`));
};

const messageOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export { envOf, failsInCi, messageOf, runOrElse, warnOnce };

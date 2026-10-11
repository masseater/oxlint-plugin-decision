# @r_masseater/oxlint-plugin-decision-presets

> [!WARNING]
> This package is experimental. Use at your own risk.

> [!CAUTION]
> Every match is a paid model request. Run the plugin only with the answer cache kept, lint only changed files, and exclude files you don't need, such as `node_modules` and `dist`. The authors take no responsibility for any cost incurred by running it as is over every file of a codebase. See [Cost and caching](https://github.com/masseater/oxlint-plugin-decision/tree/main/libs/oxlint-plugin-decision#cost-and-caching).

Ready-made [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) rules for [@r_masseater/oxlint-plugin-decision](https://www.npmjs.com/package/@r_masseater/oxlint-plugin-decision), answered by decision models on [OpenRouter](https://openrouter.ai).

Each preset is a list of plain-English questions about your code. The plugin asks a decision model each question for every match and reports an error when the answer clears the rule's cutoff. Pick a preset to start linting without writing any rules, and add your own rules when you need them.

## Install

```sh
npm i -D oxlint @r_masseater/oxlint-plugin-decision @r_masseater/oxlint-plugin-decision-presets
export OPENROUTER_API_KEY="..."   # https://openrouter.ai/settings/keys
```

The plugin reads the key from the `OPENROUTER_API_KEY` environment variable; set `env` under `settings["decision-presets"]`, such as `{ "OPENROUTER_API_KEY": "TEAM_OPENROUTER_KEY" }`, to read it from a variable with another name. Without it, the plugin warns once and reports nothing. In CI (when the `CI` environment variable is set), a run that could not reach a model fails instead of passing quietly.

## Use a preset

Point `jsPlugins` at a preset and turn on its rules. Each rule is its own oxlint rule, named `decision-presets/<id>`, so you choose which ones run and at what severity. Settings such as `model`, `ci` and `timeoutMs` go under `settings["decision-presets"]` and apply to every rule of the preset.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["@r_masseater/oxlint-plugin-decision-presets/recommended"],
  rules: {
    "decision-presets/no-pii-in-logs": "error",
    "decision-presets/no-prompt-injection": "error",
    "decision-presets/no-hardcoded-secrets": "error",
  },
});
```

A preset decides which rules the plugin registers. A rule turns on only when you list it under `rules`.

| Preset                        | Import path                                               | Rule prefix         | What it is for                                                                                             | Run it as                            |
| ----------------------------- | --------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [`recommended`](#recommended) | `@r_masseater/oxlint-plugin-decision-presets/recommended` | `decision-presets/` | Security problems that should never ship: personal data in logs, prompt injection, hard-coded secrets.     | `"error"`                            |
| [`strict`](#strict)           | `@r_masseater/oxlint-plugin-decision-presets/strict`      | `decision-presets/` | `recommended` plus code that breaks a promise its name makes, hidden failures, and tests that cannot fail. | `"error"`                            |
| [`review-only`](#review-only) | `@r_masseater/oxlint-plugin-decision-presets/review-only` | `decision-presets/` | Judgment calls worth a look in review, mostly text that misdescribes the code next to it.                  | `"warn"`                             |
| [`ai-slop`](#ai-slop)         | `@r_masseater/oxlint-plugin-decision-presets/ai-slop`     | `decision-ai-slop/` | Padding that coding agents tend to leave behind.                                                           | `"warn"`, `"error"` for placeholders |

The package root (`@r_masseater/oxlint-plugin-decision-presets`) is the `recommended` preset.

## Presets

Every rule asks a yes/no question (answer kind `boolean`) unless its row says otherwise. "Asks about" is what each rule sends to the model, so it is also what each rule costs.

### recommended

The smallest set, for problems that are wrong wherever they appear. Each rule has a high cutoff (0.8), so it reports only when the model is confident. Turn every rule on as `"error"` and fail the build on it.

| Id                     | Asks about     | Reports                                                         |
| ---------------------- | -------------- | --------------------------------------------------------------- |
| `no-pii-in-logs`       | Every call     | A call that writes personal data to a log or console.           |
| `no-prompt-injection`  | Every function | Untrusted user input concatenated into a language model prompt. |
| `no-hardcoded-secrets` | Every file     | A hard-coded secret as a literal value.                         |

### strict

Everything in `recommended`, plus code that breaks a promise its name makes (a `get*` that writes, a `compute*` with side effects, a `safe*` that throws, an `ensure*` that is not safe to repeat), a catch that hides a failure from its caller, and tests that cannot fail. These are bugs rather than style, so run them as `"error"`. Several rules only ask about functions with a matching name, which keeps the request count down.

| Id                         | Asks about                                                                      | Answer                               | Reports                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `name-matches-behavior`    | Every function                                                                  | `boolean`                            | A read-only name (get, find, load, fetch) on a body that also writes, logs, or sends.   |
| `untrusted-input-risk`     | Every function                                                                  | `severity`, reports `warn` and above | Untrusted input spliced into a query, command, markup, or prompt.                       |
| `pure-name-is-pure`        | Functions named `compute*`, `calculate*`, `derive*`, `format*`, `to*`, `parse*` | `boolean`                            | A side effect or I/O in a function named as a computation.                              |
| `safe-name-is-safe`        | Functions named `safe*`, `try*`, `*OrNull`, `*OrDefault`, `*OrUndefined`        | `boolean`                            | A failure that escapes as a throw or rejection.                                         |
| `idempotent-name`          | Functions named `ensure*`, `upsert*`, `setup*`, `install*`, `register*`         | `boolean`                            | A second call that leaves a different result from the first.                            |
| `catch-hides-failure`      | Every function                                                                  | `boolean`                            | A catch block that hides a failure the caller needed to know about.                     |
| `test-name-verifies-claim` | `it(...)` and `test(...)` calls                                                 | `boolean`                            | A test that would still pass if the behaviour its name claims broke.                    |
| `test-mocks-subject`       | `it(...)` and `test(...)` calls                                                 | `boolean`                            | A test whose assertion reads back a mock's canned value instead of the code under test. |

Turn the code rules on for your sources and the test rules for your tests, so the code rules do not ask about every test callback:

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["@r_masseater/oxlint-plugin-decision-presets/strict"],
  rules: {
    "decision-presets/name-matches-behavior": "error",
    "decision-presets/catch-hides-failure": "error",
  },
  overrides: [
    {
      files: ["**/*.test.*"],
      rules: {
        "decision-presets/name-matches-behavior": "off",
        "decision-presets/catch-hides-failure": "off",
        "decision-presets/test-name-verifies-claim": "error",
        "decision-presets/test-mocks-subject": "error",
      },
    },
  ],
});
```

### review-only

Judgment calls that are worth a look in review but too subjective to fail a build: names in general, comments, documented errors, error and log messages, variable names and test titles that misdescribe the code next to them. Expect some false positives. Run it as `"warn"`, and read the warnings in review rather than gating merges on them. It does not include `recommended`.

| Id                                | Asks about                                       | Reports                                                                                                |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `domain-naming`                   | Every function                                   | A function about one business concept named after a mechanism word (Manager, Processor, Data, handle). |
| `prefer-schema-validation`        | Every function                                   | A long hand-written chain of typeof and field checks that a schema would describe.                     |
| `fn-name-promises`                | Every function                                   | A body that does something materially different from what the name promises.                           |
| `comment-describes-declaration`   | Functions with a comment directly above          | A comment that claims something the function does not do.                                              |
| `comment-describes-block`         | Every function                                   | A comment inside the body that the code beneath it contradicts.                                        |
| `doc-errors-match-body`           | Functions with a comment directly above          | Documented failures (throws, rejects, returns null) that the body does not match.                      |
| `error-message-matches-condition` | Every function                                   | A thrown error whose message describes a different condition from the one that throws it.              |
| `log-level-matches-event`         | Log calls (`console.*`, `logger.*` and the like) | A log level that misstates the severity of what the code is handling.                                  |
| `log-message-matches-event`       | Log calls                                        | A log message that misdescribes what happened at that point.                                           |
| `var-name-describes-value`        | Every function                                   | A binding whose name misdescribes its value.                                                           |
| `describe-names-subject`          | `describe(...)` calls                            | Tests that exercise something other than what the describe title names.                                |
| `test-name-describes-code`        | `it(...)` and `test(...)` calls                  | A test that exercises another operation, input or outcome than its name names.                         |
| `snapshot-only-behaviour-claim`   | `it(...)` and `test(...)` calls                  | A test that claims a specific behaviour but only compares a whole-output snapshot.                     |

### ai-slop

Catches the padding that coding agents tend to leave in JavaScript and TypeScript: guards that can never fire, made-up defaults, wrappers that add nothing, stand-in bodies, comments that repeat the code or narrate the change, and casts or lint suppressions in place of a fix. Most of it is noise rather than a bug, so run it as `"warn"`; a placeholder body is a real gap, so `placeholder-implementation` is worth `"error"`. Each rule only asks about functions that contain what it looks for, such as a cast or a comment. The cutoffs were tuned on Span-01 Lite (`openrouter/respan/span-01-lite`).

This entry is its own plugin, named `decision-ai-slop`, so its rules are `decision-ai-slop/<id>` and its settings go under `settings["decision-ai-slop"]`. It can be loaded next to any other preset.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["@r_masseater/oxlint-plugin-decision-presets/ai-slop"],
  rules: {
    "decision-ai-slop/redundant-guard": "warn",
    "decision-ai-slop/default-masks-missing-value": "warn",
    "decision-ai-slop/pass-through-wrapper": "warn",
    "decision-ai-slop/placeholder-implementation": "error",
    "decision-ai-slop/comment-restates-code": "warn",
    "decision-ai-slop/comment-narrates-history": "warn",
    "decision-ai-slop/doc-restates-signature": "warn",
    "decision-ai-slop/cast-instead-of-narrowing": "warn",
    "decision-ai-slop/suppression-instead-of-fix": "warn",
    "decision-ai-slop/reinvents-builtin": "warn",
  },
});
```

| Id                            | Asks about                                                               | Reports                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `redundant-guard`             | Functions with an `if`, `?:`, `?.`, `typeof` or `try`                    | A parameter checked for a case its declared type already rules out.                      |
| `default-masks-missing-value` | Functions with `??`, `??=`, `\|\|` with a literal, or default parameters | A made-up default standing in for a value that should always be there.                   |
| `pass-through-wrapper`        | Functions whose body is one call                                         | A function that only forwards its arguments to another one.                              |
| `placeholder-implementation`  | Functions with at most one statement                                     | A body that returns a fixed value or does nothing where the name promises real work.     |
| `comment-restates-code`       | Functions with comments inside                                           | A comment that only says again what the next line does.                                  |
| `comment-narrates-history`    | Functions with comments inside                                           | A comment about what was changed, a stopgap, or the conversation that produced the code. |
| `doc-restates-signature`      | Functions with a comment directly above                                  | A doc comment that only rewords the name and parameters.                                 |
| `cast-instead-of-narrowing`   | Functions with `as`, `<T>` or `!` (not `as const`)                       | A type assertion the code has not established.                                           |
| `suppression-instead-of-fix`  | Functions with an `eslint-disable`, `oxlint-disable` or `@ts-*` comment  | A suppression with no reason, or one hiding a problem with a local fix.                  |
| `reinvents-builtin`           | Every function that is not an inline callback                            | A hand-written loop that re-implements a standard built-in.                              |

The rules are also exported one by one, and as the list `aiSlopRules`, for your own plugin.

## Run several presets together

`recommended`, `strict` and `review-only` are one plugin, `decision-presets`, so only one of them can be loaded under that name. To run `strict` and `review-only` together, load `review-only` under another name. Its rules are then `<name>/<id>`, and both read their settings from `settings["decision-presets"]`. `ai-slop` has its own plugin name and loads next to any of them.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: [
    "@r_masseater/oxlint-plugin-decision-presets/strict",
    {
      name: "decision-review",
      specifier: "@r_masseater/oxlint-plugin-decision-presets/review-only",
    },
    "@r_masseater/oxlint-plugin-decision-presets/ai-slop",
  ],
  rules: {
    "decision-presets/catch-hides-failure": "error",
    "decision-review/comment-describes-declaration": "warn",
    "decision-ai-slop/placeholder-implementation": "error",
  },
});
```

## Models

The presets use the plugin's default model, `openrouter/~typesafe/jev-latest`, which supports every preset. Set `model` under `settings["decision-presets"]` to use another one.

Respan models, such as the free `openrouter/respan/span-01-lite`, answer only yes/no questions. The plugin asks them `untrusted-input-risk`, the one `severity` rule, as one yes/no question per level, so every preset works with them.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["@r_masseater/oxlint-plugin-decision-presets/recommended"],
  settings: {
    "decision-presets": {
      model: "openrouter/respan/span-01-lite",
    },
  },
  rules: {
    "decision-presets/no-pii-in-logs": "error",
    "decision-presets/no-prompt-injection": "error",
    "decision-presets/no-hardcoded-secrets": "error",
  },
});
```

To run one rule on a different model, give that rule a `model` in its options. Options next to the severity override the preset's settings for that rule only.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["@r_masseater/oxlint-plugin-decision-presets/strict"],
  settings: {
    "decision-presets": {
      model: "openrouter/respan/span-01-lite",
    },
  },
  rules: {
    "decision-presets/no-pii-in-logs": "error",
    "decision-presets/untrusted-input-risk": [
      "error",
      {
        model: "openrouter/~typesafe/jev-latest",
      },
    ],
  },
});
```

Each model is asked only about the rules that use it. See [Rule options](https://github.com/masseater/oxlint-plugin-decision/tree/main/libs/oxlint-plugin-decision#rule-options) in the plugin README.

Every match is a paid request unless its answer is cached. See [Cost and caching](https://github.com/masseater/oxlint-plugin-decision/tree/main/libs/oxlint-plugin-decision#cost-and-caching) in the plugin README.

## Mix presets with your own rules

Every preset and rule is exported, along with the lists `codeClaims` and `testClaims` of the rules adapted from jev-lint, so you can build your own plugin with `createDecisionPlugin` from `@r_masseater/oxlint-plugin-decision`.

```js
// decision.mjs
import { createDecisionPlugin, defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";
import {
  commentDescribesDeclaration,
  recommended,
} from "@r_masseater/oxlint-plugin-decision-presets";

export default createDecisionPlugin({
  name: "team",
  rules: [
    ...recommended,
    commentDescribesDeclaration,
    defineDecisionRule({
      id: "no-direct-db-in-handlers",
      target: "function",
      question: "Is this an HTTP request handler that queries the database directly?",
      cutoff: 0.8,
    }),
  ],
});
```

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./decision.mjs"],
  rules: {
    "team/no-pii-in-logs": "error",
    "team/no-prompt-injection": "error",
    "team/no-hardcoded-secrets": "error",
    "team/comment-describes-declaration": "warn",
    "team/no-direct-db-in-handlers": "error",
  },
});
```

## Credits

The rules that check a claim the code makes about itself are adapted from [jev-lint](https://github.com/mizchi/jev-lint) by mizchi: `fn-name-promises`, `pure-name-is-pure`, `safe-name-is-safe`, `idempotent-name`, `catch-hides-failure`, `error-message-matches-condition`, `log-level-matches-event`, `log-message-matches-event`, `comment-describes-block`, `comment-describes-declaration`, `doc-errors-match-body`, `var-name-describes-value`, `describe-names-subject`, `test-name-describes-code`, `test-name-verifies-claim`, `snapshot-only-behaviour-claim` and `test-mocks-subject`. Their questions and cutoffs come from jev-lint, which tuned them on the default model, `openrouter/~typesafe/jev-latest`. jev-lint's rules that look across files, or at types, classes, other languages, documents and commits, are not here.

## License

AGPL-3.0-only. Portions from oxlint-plugin-jev and jev-lint stay under the MIT License; see NOTICE.

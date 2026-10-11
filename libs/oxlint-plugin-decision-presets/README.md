# @r_masseater/oxlint-plugin-decision-presets

> [!WARNING]
> This package is experimental. Use at your own risk.

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

```json
{
  "jsPlugins": ["@r_masseater/oxlint-plugin-decision-presets/recommended"],
  "rules": {
    "decision-presets/no-pii-in-logs": "error",
    "decision-presets/no-prompt-injection": "error",
    "decision-presets/no-hardcoded-secrets": "error"
  }
}
```

A preset decides which rules the plugin registers. A rule turns on only when you list it under `rules`.

| Import path                                               | Rules                                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@r_masseater/oxlint-plugin-decision-presets/recommended` | `no-pii-in-logs`, `no-prompt-injection`, `no-hardcoded-secrets`                           |
| `@r_masseater/oxlint-plugin-decision-presets/strict`      | `recommended` plus `name-matches-behavior`, `no-swallowed-errors`, `untrusted-input-risk` |
| `@r_masseater/oxlint-plugin-decision-presets/review-only` | `name-matches-behavior`, `stale-comment`, `domain-naming`, `prefer-schema-validation`     |

The package root (`@r_masseater/oxlint-plugin-decision-presets`) is the `recommended` preset.

`review-only` holds judgment calls that are worth a look in review but too subjective to fail a build. Run it as `"warn"`.

## Rules

| Id                         | Target     | Asks                                                                                                       |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `no-pii-in-logs`           | `call`     | Does this call write personal data to a log or console?                                                    |
| `no-prompt-injection`      | `function` | Does this function concatenate untrusted user input into a language model prompt?                          |
| `no-hardcoded-secrets`     | `file`     | Does this file contain a hard-coded secret as a literal value?                                             |
| `name-matches-behavior`    | `function` | Does a read-only name (get, find, load, fetch) hide a body that also writes, logs, or sends?               |
| `no-swallowed-errors`      | `function` | Does this function catch an error and drop it?                                                             |
| `untrusted-input-risk`     | `function` | How severe is splicing untrusted input into a query, command, markup, or prompt? Reports `warn` and above. |
| `stale-comment`            | `function` | Does the comment above the function claim something the code does not do?                                  |
| `domain-naming`            | `function` | Is a function about one business concept named after a mechanism word (Manager, Processor, Data, handle)?  |
| `prefer-schema-validation` | `function` | Does a long hand-written chain of typeof and field checks validate data a schema would describe?           |

## Models

The presets use the plugin's default model, `openrouter/~typesafe/jev-latest`, which supports every preset. Set `model` under `settings["decision-presets"]` to use another one.

Respan models, such as the free `openrouter/respan/span-01-lite`, answer only yes/no questions. The plugin asks them `untrusted-input-risk` (a `severity` rule) and `stale-comment` (a `classify` rule) as one yes/no question per level or label, so every preset works with them.

```json
{
  "jsPlugins": ["@r_masseater/oxlint-plugin-decision-presets/recommended"],
  "settings": { "decision-presets": { "model": "openrouter/respan/span-01-lite" } },
  "rules": {
    "decision-presets/no-pii-in-logs": "error",
    "decision-presets/no-prompt-injection": "error",
    "decision-presets/no-hardcoded-secrets": "error"
  }
}
```

To run one rule on a different model, give that rule a `model` in its options. Options next to the severity override the preset's settings for that rule only.

```json
{
  "jsPlugins": ["@r_masseater/oxlint-plugin-decision-presets/strict"],
  "settings": { "decision-presets": { "model": "openrouter/respan/span-01-lite" } },
  "rules": {
    "decision-presets/no-pii-in-logs": "error",
    "decision-presets/untrusted-input-risk": [
      "error",
      { "model": "openrouter/~typesafe/jev-latest" }
    ]
  }
}
```

Each model is asked only about the rules that use it. See [Rule options](https://github.com/masseater/oxlint-plugin-decision/tree/main/libs/oxlint-plugin-decision#rule-options) in the plugin README.

Every match is a paid request unless its answer is cached. See [Cost and caching](https://github.com/masseater/oxlint-plugin-decision/tree/main/libs/oxlint-plugin-decision#cost-and-caching) in the plugin README.

## The jev rules

`@r_masseater/oxlint-plugin-decision-presets/jev` brings the JavaScript and TypeScript rules of [jev-lint](https://github.com/mizchi/jev-lint) to oxlint. Each rule checks a claim the code makes about itself (a name, a comment, a log message, a test title) against what the code actually does. The questions and cutoffs come from jev-lint, which tuned them on the default model, `openrouter/~typesafe/jev-latest`.

This entry is its own plugin, named `decision-jev`, so its rules are `decision-jev/<id>` and its settings go under `settings["decision-jev"]`. Turn the code rules on for your sources and the test rules for your tests:

```json
{
  "jsPlugins": ["@r_masseater/oxlint-plugin-decision-presets/jev"],
  "settings": { "decision-jev": { "maxMatchesPerFile": 100 } },
  "rules": {
    "decision-jev/fn-name-promises": "warn",
    "decision-jev/catch-hides-failure": "warn",
    "decision-jev/comment-describes-declaration": "warn"
  },
  "overrides": [
    {
      "files": ["**/*.test.*"],
      "rules": {
        "decision-jev/fn-name-promises": "off",
        "decision-jev/catch-hides-failure": "off",
        "decision-jev/comment-describes-declaration": "off",
        "decision-jev/test-name-verifies-claim": "warn"
      }
    }
  ]
}
```

Most code rules ask about every function, so a file can easily pass the default `maxMatchesPerFile` of 25. Raise it, or turn on only the rules you want.

| Id                                | Asks about                                                                      | Claim checked                                                             |
| --------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `fn-name-promises`                | Every function                                                                  | The body does what the name promises.                                     |
| `pure-name-is-pure`               | Functions named `compute*`, `calculate*`, `derive*`, `format*`, `to*`, `parse*` | The body has no side effects or I/O.                                      |
| `safe-name-is-safe`               | Functions named `safe*`, `try*`, `*OrNull`, `*OrDefault`, `*OrUndefined`        | No failure escapes as a throw or rejection.                               |
| `idempotent-name`                 | Functions named `ensure*`, `upsert*`, `setup*`, `install*`, `register*`         | A second call leaves the same result as the first.                        |
| `catch-hides-failure`             | Every function                                                                  | No catch block hides a failure the caller needed.                         |
| `error-message-matches-condition` | Every function                                                                  | Each thrown error's message describes the condition that throws it.       |
| `log-level-matches-event`         | Log calls (`console.*`, `logger.*` and the like)                                | The level fits what the code is handling.                                 |
| `log-message-matches-event`       | Log calls                                                                       | The message says what happened at that point.                             |
| `comment-describes-block`         | Every function                                                                  | Comments inside the body agree with the code beneath them.                |
| `comment-describes-declaration`   | Functions with a comment directly above                                         | The comment is true of the function.                                      |
| `doc-errors-match-body`           | Functions with a comment directly above                                         | The documented failures (throws, rejects, returns null) match the body.   |
| `var-name-describes-value`        | Every function                                                                  | Each binding's name describes its value.                                  |
| `describe-names-subject`          | `describe(...)` calls                                                           | The tests exercise what the title names.                                  |
| `test-name-describes-code`        | `it(...)` and `test(...)` calls                                                 | The test exercises the operation, input and outcome its name names.       |
| `test-name-verifies-claim`        | `it(...)` and `test(...)` calls                                                 | The test would fail if the named behaviour broke.                         |
| `snapshot-only-behaviour-claim`   | `it(...)` and `test(...)` calls                                                 | A behaviour claim is checked by more than a whole-output snapshot.        |
| `test-mocks-subject`              | `it(...)` and `test(...)` calls                                                 | The behaviour under test is not a mock reading back its own canned value. |

The rules are also exported one by one, and as the lists `jev`, `jevCode` and `jevTests`, for your own plugin.

jev-lint also has rules that look across files (module naming, failure paths no test reaches) and rules for types, classes, other languages, documents and commits. Those need more than one match at a time, so they are not here.

## The ai-slop rules

`@r_masseater/oxlint-plugin-decision-presets/ai-slop` catches the padding that coding agents tend to leave in JavaScript and TypeScript: guards that can never fire, made-up defaults, wrappers that add nothing, stand-in bodies, comments that repeat the code or narrate the change, and casts or lint suppressions in place of a fix.

This entry is its own plugin, named `decision-ai-slop`, so its rules are `decision-ai-slop/<id>` and its settings go under `settings["decision-ai-slop"]`.

```json
{
  "jsPlugins": ["@r_masseater/oxlint-plugin-decision-presets/ai-slop"],
  "settings": { "decision-ai-slop": { "maxMatchesPerFile": 100 } },
  "rules": {
    "decision-ai-slop/redundant-guard": "warn",
    "decision-ai-slop/default-masks-missing-value": "warn",
    "decision-ai-slop/pass-through-wrapper": "warn",
    "decision-ai-slop/placeholder-implementation": "error",
    "decision-ai-slop/comment-restates-code": "warn",
    "decision-ai-slop/comment-narrates-history": "warn",
    "decision-ai-slop/doc-restates-signature": "warn",
    "decision-ai-slop/cast-instead-of-narrowing": "warn",
    "decision-ai-slop/suppression-instead-of-fix": "warn",
    "decision-ai-slop/reinvents-builtin": "warn"
  }
}
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

The cutoffs were tuned on Span-01 Lite (`openrouter/respan/span-01-lite`). The rules are also exported one by one, and as the list `aiSlopRules`, for your own plugin.

## Mix presets with your own rules

Every preset and rule is exported, so you can build your own plugin with `createDecisionPlugin` from `@r_masseater/oxlint-plugin-decision`.

```js
// decision.mjs
import { createDecisionPlugin, defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";
import { recommended, staleComment } from "@r_masseater/oxlint-plugin-decision-presets";

export default createDecisionPlugin({
  name: "team",
  rules: [
    ...recommended,
    staleComment,
    defineDecisionRule({
      id: "no-direct-db-in-handlers",
      target: "function",
      question: "Is this an HTTP request handler that queries the database directly?",
      cutoff: 0.8,
    }),
  ],
});
```

```json
{
  "jsPlugins": ["./decision.mjs"],
  "rules": {
    "team/no-pii-in-logs": "error",
    "team/no-prompt-injection": "error",
    "team/no-hardcoded-secrets": "error",
    "team/stale-comment": "warn",
    "team/no-direct-db-in-handlers": "error"
  }
}
```

## License

AGPL-3.0-only. Portions from oxlint-plugin-jev and jev-lint stay under the MIT License; see NOTICE.

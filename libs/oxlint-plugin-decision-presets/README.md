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

The plugin reads the key from the `OPENROUTER_API_KEY` environment variable; set `env` under `settings["decision-presets"]`, such as `{ "OPENROUTER_API_KEY": "TEAM_OPENROUTER_KEY" }`, to read it from a variable with another name. Without it, the plugin warns once and reports nothing. In CI, set `ci: "fail"` so a run that could not reach a model fails instead of passing quietly.

## Use a preset

Point `jsPlugins` at a preset and turn on its rules. Each rule is its own oxlint rule, named `decision-presets/<id>`, so you choose which ones run and at what severity. Settings such as `model`, `ci` and `timeoutMs` go under `settings["decision-presets"]` and apply to every rule of the preset.

```json
{
  "jsPlugins": ["@r_masseater/oxlint-plugin-decision-presets/recommended"],
  "settings": { "decision-presets": { "ci": "fail" } },
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
| `@r_masseater/oxlint-plugin-decision-presets/review-only` | `name-matches-behavior`, `stale-comment`                                                  |

The package root (`@r_masseater/oxlint-plugin-decision-presets`) is the `recommended` preset.

`review-only` holds judgment calls that are worth a look in review but too subjective to fail a build. Run it as `"warn"`.

## Rules

| Id                      | Target     | Asks                                                                                                       |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `no-pii-in-logs`        | `call`     | Does this call write personal data to a log or console?                                                    |
| `no-prompt-injection`   | `function` | Does this function concatenate untrusted user input into a language model prompt?                          |
| `no-hardcoded-secrets`  | `file`     | Does this file contain a hard-coded secret as a literal value?                                             |
| `name-matches-behavior` | `function` | Does a read-only name (get, find, load, fetch) hide a body that also writes, logs, or sends?               |
| `no-swallowed-errors`   | `function` | Does this function catch an error and drop it?                                                             |
| `untrusted-input-risk`  | `function` | How severe is splicing untrusted input into a query, command, markup, or prompt? Reports `warn` and above. |
| `stale-comment`         | `function` | Does the comment above the function claim something the code does not do?                                  |

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

Every match is a paid request unless its answer is cached. See [Cost and caching](https://github.com/masseater/oxlint-plugin-decision/tree/main/libs/oxlint-plugin-decision#cost-and-caching) in the plugin README.

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
  "settings": { "team": { "ci": "fail" } },
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

AGPL-3.0-only. Portions from oxlint-plugin-jev stay under the MIT License; see NOTICE.

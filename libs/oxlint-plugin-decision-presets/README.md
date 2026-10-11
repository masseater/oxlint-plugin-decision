# oxlint-plugin-decision-presets

> [!WARNING]
> This package is experimental. Use at your own risk.

Ready-made [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) rules for [oxlint-plugin-decision](https://www.npmjs.com/package/oxlint-plugin-decision), answered by decision models on [OpenRouter](https://openrouter.ai).

Each preset is a list of plain-English questions about your code. The plugin asks a decision model each question for every match and reports an error when the answer clears the rule's cutoff. Pick a preset to start linting without writing any rules, and add your own rules when you need them.

## Install

```sh
npm i -D oxlint oxlint-plugin-decision oxlint-plugin-decision-presets
export OPENROUTER_API_KEY="..."   # https://openrouter.ai/settings/keys
```

The plugin reads the key from the `OPENROUTER_API_KEY` environment variable. Without it, the plugin warns once and reports nothing. In CI, set `ci: "fail"` so a run that could not reach a model fails instead of passing quietly.

## Use a preset

Point `jsPlugins` at a preset and turn on `decision/ask`. The options take the same settings as `oxlint-plugin-decision` (`model`, `ci`, `timeoutMs`, ...), and any `rules` you list are added to the preset's rules.

```json
{
  "jsPlugins": ["oxlint-plugin-decision-presets/recommended"],
  "rules": {
    "decision/ask": ["error", { "ci": "fail" }]
  }
}
```

| Import path                                  | Rules                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `oxlint-plugin-decision-presets/recommended` | `no-pii-in-logs`, `no-prompt-injection`, `no-hardcoded-secrets`                           |
| `oxlint-plugin-decision-presets/strict`      | `recommended` plus `name-matches-behavior`, `no-swallowed-errors`, `untrusted-input-risk` |
| `oxlint-plugin-decision-presets/review-only` | `name-matches-behavior`, `stale-comment`                                                  |

The package root (`oxlint-plugin-decision-presets`) is the `recommended` preset.

`review-only` holds judgment calls that are worth a look in review but too subjective to fail a build. Run it as `"warn"`.

## Rules

| Id                      | Target     | Asks                                                                                         |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `no-pii-in-logs`        | `call`     | Does this call write personal data to a log or console?                                      |
| `no-prompt-injection`   | `function` | Does this function concatenate untrusted user input into a language model prompt?            |
| `no-hardcoded-secrets`  | `file`     | Does this file contain a hard-coded secret as a literal value?                               |
| `name-matches-behavior` | `function` | Does a read-only name (get, find, load, fetch) hide a body that also writes, logs, or sends? |
| `no-swallowed-errors`   | `function` | Does this function catch an error and drop it?                                               |
| `untrusted-input-risk`  | `function` | How severe is the way this function handles untrusted input? Reports `warn` and above.       |
| `stale-comment`         | `function` | Does the comment above the function describe behavior the code no longer has?                |

## Models

The presets use the plugin's default model, `openrouter/~typesafe/jev-latest`, which supports every preset. Set `model` in the options to use another one.

Respan models, such as the free `openrouter/respan/span-01-lite`, answer only yes/no questions. `untrusted-input-risk` (a `severity` rule) and `stale-comment` (a `classify` rule) need a model that answers choice questions, so with Respan models only `recommended` works; `strict` and `review-only` do not.

```json
{
  "jsPlugins": ["oxlint-plugin-decision-presets/recommended"],
  "rules": {
    "decision/ask": ["error", { "model": "openrouter/respan/span-01-lite" }]
  }
}
```

Every match is a paid request unless its answer is cached. See [Cost and caching](https://github.com/masseater/oxlint-plugin-decision/tree/main/libs/oxlint-plugin-decision#cost-and-caching) in the plugin README.

## Mix presets with your own rules

Every preset and rule is exported, so you can build your own plugin with `createDecisionPlugin` from `oxlint-plugin-decision`.

```js
// decision.mjs
import { createDecisionPlugin, defineDecisionRule } from "oxlint-plugin-decision";
import { recommended, staleComment } from "oxlint-plugin-decision-presets";

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
  "rules": { "team/ask": ["error", { "ci": "fail" }] }
}
```

## License

MIT

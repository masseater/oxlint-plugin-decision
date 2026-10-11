# oxlint-plugin-decision-presets

> [!WARNING]
> This package is experimental. Use at your own risk.

Ready-made rule presets for [oxlint-plugin-decision](https://www.npmjs.com/package/oxlint-plugin-decision). Each preset is a list of plain-English rules that decision models on [OpenRouter](https://openrouter.ai) answer for every match.

## Install

```sh
npm i -D oxlint oxlint-plugin-decision oxlint-plugin-decision-presets
export OPENROUTER_API_KEY="..."   # https://openrouter.ai/settings/keys
```

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

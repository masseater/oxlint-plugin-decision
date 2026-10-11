# oxlint-plugin-decision

> [!WARNING]
> These packages are experimental. Use at your own risk.

[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) rules written in plain English, answered by decision models on [OpenRouter](https://openrouter.ai).

A rule is a question, such as "Does this call write personal data to a log?". The plugin sends each matching function, call, JSX element or file to a decision model through the OpenRouter Decisions API, gets back the probability of each answer, and reports a lint error when the answer clears the rule's cutoff.

## Packages

| Package                                                                              | Use it when                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [`@r_masseater/oxlint-plugin-decision-presets`](libs/oxlint-plugin-decision-presets) | You want to start linting right away. It ships ready-made rules for logs, secrets, prompt injection and more, in three presets. |
| [`@r_masseater/oxlint-plugin-decision`](libs/oxlint-plugin-decision)                 | You want to write your own rules. It is the plugin itself: the rule format, answer kinds, context, models and providers.        |

The presets package runs on top of `@r_masseater/oxlint-plugin-decision`, so you can start with a preset and add your own rules to it later.

## Quick start with a preset

```sh
npm i -D oxlint @r_masseater/oxlint-plugin-decision @r_masseater/oxlint-plugin-decision-presets
export OPENROUTER_API_KEY="..."   # https://openrouter.ai/settings/keys
```

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

See the [presets README](libs/oxlint-plugin-decision-presets/README.md) for the presets and their rules.

## Quick start with your own rules

```sh
npm i -D oxlint @r_masseater/oxlint-plugin-decision
export OPENROUTER_API_KEY="..."
```

The plugin itself ships no rules. Write yours in a plugin file:

```js
// decision-plugin.mjs
import { createDecisionPlugin, defineDecisionRule } from "@r_masseater/oxlint-plugin-decision";

export default createDecisionPlugin({
  name: "team",
  rules: [
    defineDecisionRule({
      id: "no-pii-in-logs",
      target: "call",
      question:
        "Does this call write personal data, such as an email or phone number, to a log or console?",
      cutoff: 0.8,
    }),
  ],
});
```

Then load it and turn each rule on by its id:

```json
{
  "jsPlugins": ["./decision-plugin.mjs"],
  "rules": { "team/no-pii-in-logs": "error" }
}
```

See the [plugin README](libs/oxlint-plugin-decision/README.md) for rule fields, answer kinds, context, models, settings, providers, and cost and caching.

## Models

The default model, `openrouter/~typesafe/jev-latest`, supports every rule and preset.

Respan models, such as the free `openrouter/respan/span-01-lite`, answer only yes/no questions. The plugin asks them `classify`, `severity` and file-rule `location` questions as one yes/no question per label, level or line, so every preset works with them. These rules cost more requests on Respan models, and `location` is less precise than on the default model.

## Contributing

To work on the packages themselves, see [CONTRIBUTING.md](CONTRIBUTING.md).

This is a fork of [oxlint-plugin-jev](https://github.com/wobsoriano/oxlint-plugin-jev) by [Robert Soriano](https://github.com/wobsoriano).

## License

[MIT](LICENSE)

# oxlint-plugin-decision

> [!WARNING]
> This package is experimental. Use at your own risk.

[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) rules written in plain English, answered by decision models on [OpenRouter](https://openrouter.ai).

You write a rule as a question, such as "Does this call write personal data to a log?". The plugin sends each matching function, call, JSX element or file to a decision model through the OpenRouter Decisions API, gets back the probability of each answer, and reports a lint error when the answer clears your cutoff.

```sh
npm i -D oxlint oxlint-plugin-decision
export OPENROUTER_API_KEY="..."
```

```json
{
  "jsPlugins": ["oxlint-plugin-decision"],
  "rules": {
    "decision/ask": [
      "error",
      {
        "rules": [
          {
            "id": "no-pii-in-logs",
            "target": "call",
            "question": "Does this call write personal data, such as an email or phone number, to a log or console?",
            "cutoff": 0.8
          }
        ]
      }
    ]
  }
}
```

See the [package README](libs/oxlint-plugin-decision/README.md) for the full guide: rule fields, answer kinds, context, models, settings, rules in code, cost and caching. To work on the plugin itself, see [CONTRIBUTING.md](CONTRIBUTING.md).

This is a fork of [oxlint-plugin-jev](https://github.com/wobsoriano/oxlint-plugin-jev) by [Robert Soriano](https://github.com/wobsoriano).

## License

[MIT](LICENSE)

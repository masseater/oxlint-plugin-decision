# oxlint-plugin-decision

> [!WARNING]
> These packages are experimental. Use at your own risk.

> [!CAUTION]
> Every match that is not cached is a model request, billed unless you use a free model. Run the plugin only with the answer cache kept, lint only changed files, and exclude files you don't need, such as `node_modules` and `dist`. The authors take no responsibility for any cost incurred by running it as is over every file of a codebase. See [Cost and caching](#cost-and-caching).

[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) rules written in plain English, answered by decision models on [OpenRouter](https://openrouter.ai).

A rule is a question, such as "Does this call write personal data to a log?". The plugin sends each matching function, call, JSX element or file to a decision model through the OpenRouter Decisions API, gets back the probability of each answer, and reports a lint error when the answer clears the rule's cutoff.

## Packages

| Package                                                                              | Use it when                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [`@r_masseater/oxlint-plugin-decision-presets`](libs/oxlint-plugin-decision-presets) | You want to start linting right away. It ships ready-made rules for logs, secrets, prompt injection and more, in four presets. |
| [`@r_masseater/oxlint-plugin-decision`](libs/oxlint-plugin-decision)                 | You want to write your own rules. It is the plugin itself: the rule format, answer kinds, context, models and providers.       |

The presets package runs on top of `@r_masseater/oxlint-plugin-decision`, so you can start with a preset and add your own rules to it later.

## Links

- npm: https://www.npmjs.com/package/@r_masseater/oxlint-plugin-decision
- npm: https://www.npmjs.com/package/@r_masseater/oxlint-plugin-decision-presets

## Quick start with a preset

```sh
npm i -D oxlint @r_masseater/oxlint-plugin-decision @r_masseater/oxlint-plugin-decision-presets
export OPENROUTER_API_KEY="..."   # https://openrouter.ai/settings/keys
```

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

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./decision-plugin.mjs"],
  rules: {
    "team/no-pii-in-logs": "error",
  },
});
```

See the [plugin README](libs/oxlint-plugin-decision/README.md) for rule fields, answer kinds, context, models, settings and providers.

## Cost and caching

Every match is a model request unless its answer is already cached, and requests to paid models are billed, so keep an eye on what your rules match. Before running the plugin on a real codebase, put these three in place:

1. **Exclude files you don't need.** Generated and vendored code, such as `node_modules`, `dist` and build output, only adds requests. List it in `ignorePatterns`, and use `overrides` to turn rules on only where they matter.
2. **Lint only changed files.** Pass the changed paths to oxlint instead of linting the whole tree.
3. **Keep the cache.** Answers are cached under `node_modules/.cache/oxlint-plugin-decision`. Don't delete it between local runs, and persist it in CI.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./decision-plugin.mjs"],
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/*.min.js",
  ],
  rules: {
    "team/no-pii-in-logs": "off",
  },
  overrides: [
    {
      files: ["src/**/*.{ts,tsx}"],
      rules: {
        "team/no-pii-in-logs": "error",
      },
    },
  ],
});
```

Lint only the files changed since `main`. `xargs -r` skips oxlint when nothing changed; without it, oxlint would lint the whole tree:

```sh
git diff --name-only --diff-filter=d origin/main... -- '*.ts' '*.tsx' '*.js' '*.jsx' | xargs -r npx oxlint
```

Persist the cache in GitHub Actions:

```yaml
- uses: actions/cache@v4
  with:
    path: node_modules/.cache/oxlint-plugin-decision
    key: oxlint-decision-${{ github.sha }}
    restore-keys: oxlint-decision-
```

More on what drives the cost:

- Every match is sent; the plugin has no per-file cap, so a broad target, such as `"call"` on a large codebase, sends many requests. Control the volume with oxlint itself: narrow files and rules with `overrides`, and lint only changed files by passing their paths.
- Wider `context` and longer snippets cost more tokens. `maxSnippetChars` caps each snippet.
- A list of models multiplies the requests: each model answers every match.
- Answers are cached on disk under `node_modules/.cache/oxlint-plugin-decision`. Unchanged code is not asked again, so a second run over the same files is free. Editing a snippet, its context, a question or an answer kind re-asks that file; changing a cutoff or an `id` does not.
- Free models such as `openrouter/respan/span-01-lite` are a cheap way to try rules before switching to a paid model.
- Every request names the repository and where it runs as a hidden OpenRouter app, so the activity page splits spend by both. The repository comes from `GITHUB_REPOSITORY`, else the `origin` remote of the git repository around the working directory. Where it runs is `github-actions` when `GITHUB_ACTIONS` is set, `claude-code-cloud` when `CLAUDE_CODE_REMOTE` is set, `claude-code` when `CLAUDECODE` is set, and `local` otherwise. A task runner that clears the environment, such as `vp run`, must pass these variables through to the lint.

## Models

The default model, `openrouter/~typesafe/jev-latest`, supports every rule and preset.

Respan models, such as the free `openrouter/respan/span-01-lite`, answer only yes/no questions. The plugin asks them `classify`, `severity` and file-rule `location` questions as one yes/no question per label, level or line, so every preset works with them. These rules cost more requests on Respan models, and `location` is less precise than on the default model.

Each rule can use its own model: set `model` in the rule's options in `oxlint.config.ts`, for example `"team/no-pii-in-logs": ["error", { "model": "openrouter/respan/span-01-lite" }]`. See [Rule options](libs/oxlint-plugin-decision/README.md#rule-options).

## Contributing

To work on the packages themselves, see [CONTRIBUTING.md](CONTRIBUTING.md).

This is a fork of [oxlint-plugin-jev](https://github.com/wobsoriano/oxlint-plugin-jev) by [Robert Soriano](https://github.com/wobsoriano).

## License

[MIT](LICENSE).

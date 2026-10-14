# oxlint-plugin-decision

Write [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) rules as plain-English questions, such as "Does this call write personal data to a log?", and let decision models on [OpenRouter](https://openrouter.ai) answer them for every matching function, call, JSX element or file.

Use it for problems a pattern-based linter can't express: a `getUser` that also sends an email, a catch that hides a failure from its caller, user input pasted into a model prompt.

- npm: [`@r_masseater/oxlint-plugin-decision-presets`](https://www.npmjs.com/package/@r_masseater/oxlint-plugin-decision-presets), ready-made rules to start linting right away
- npm: [`@r_masseater/oxlint-plugin-decision`](https://www.npmjs.com/package/@r_masseater/oxlint-plugin-decision), the plugin itself, to write your own rules

> [!WARNING]
> These packages are experimental. Use at your own risk.

> [!CAUTION]
> Every match that is not cached is a model request, billed unless you use a free model. Keep the answer cache, lint only changed files, and exclude files you don't need, such as `node_modules` and `dist`. The authors take no responsibility for any cost incurred by running it as is over every file of a codebase. See [Keep the cost down](#keep-the-cost-down).

## Start with a preset

You need Node.js 20 or later and an [OpenRouter API key](https://openrouter.ai/settings/keys).

```sh
npm i -D oxlint @r_masseater/oxlint-plugin-decision @r_masseater/oxlint-plugin-decision-presets
export OPENROUTER_API_KEY="..."
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

Put a call that logs personal data in a file and lint it:

```js
// check.js
console.log("loaded", user.email, user.phone);
```

```sh
OXLINT_DECISION_EXPLAIN=1 npx oxlint check.js
```

oxlint reports `no-pii-in-logs` on the call, and `OXLINT_DECISION_EXPLAIN=1` prints what the model answered for each match. If the plugin prints `OPENROUTER_API_KEY is not set` instead, the key did not reach oxlint.

The [presets README](libs/oxlint-plugin-decision-presets/README.md) lists every preset and rule.

## Write your own rules

```sh
npm i -D oxlint @r_masseater/oxlint-plugin-decision
export OPENROUTER_API_KEY="..."
```

A rule is a question about a target, and a cutoff the answer's probability must reach to report it:

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

Load the file and turn each rule on by its id:

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

The [plugin README](libs/oxlint-plugin-decision/README.md) covers targets, answer kinds, context, models and settings.

## Keep the cost down

Before running the plugin on a real codebase, put these three in place.

1. Exclude files you don't need. List generated and vendored code in `ignorePatterns`, and use `overrides` to turn rules on only where they matter.
2. Lint only changed files instead of the whole tree:

   ```sh
   git diff --name-only --diff-filter=d origin/main... -- '*.ts' '*.tsx' '*.js' '*.jsx' | xargs -r npx oxlint
   ```

3. Keep the cache. Answers are cached under `node_modules/.cache/oxlint-plugin-decision`, so unchanged code is not asked again. Don't delete it between local runs, and persist it in CI:

   ```yaml
   - uses: actions/cache@v4
     with:
       path: node_modules/.cache/oxlint-plugin-decision
       key: oxlint-decision-${{ github.sha }}
       restore-keys: oxlint-decision-
   ```

To try rules without paying for requests, set a rule's model to the free `openrouter/respan/span-01-lite`, as in `"team/no-pii-in-logs": ["error", { "model": "openrouter/respan/span-01-lite" }]`.

## License

[MIT](LICENSE). This is a fork of [oxlint-plugin-jev](https://github.com/wobsoriano/oxlint-plugin-jev) by [Robert Soriano](https://github.com/wobsoriano).

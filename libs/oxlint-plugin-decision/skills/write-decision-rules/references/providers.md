# Custom providers

Read this when rules must ask a decision service other than OpenRouter. The built-in provider is `openrouter`, so `openrouter/<model>` needs no provider code.

## Define and register a provider

```js
// decision-plugin.mjs
import {
  createDecisionPlugin,
  defineDecisionRule,
  defineProvider,
} from "@r_masseater/oxlint-plugin-decision";

export default createDecisionPlugin({
  name: "team",
  model: "internal/v2",
  rules: [
    defineDecisionRule({
      id: "no-swallowed-catch",
      target: "function",
      question: "Does this function catch an error and neither handle nor rethrow it?",
      cutoff: 0.8,
    }),
  ],
  providers: [
    defineProvider({
      name: "internal",
      requiredEnv: ["INTERNAL_DECIDER_KEY"],
      decide: ({ request, timeoutMs, env }) => {
        const key = process.env[env.INTERNAL_DECIDER_KEY ?? "INTERNAL_DECIDER_KEY"];
        return { ok: true, response: callYourDecider(request, key, timeoutMs) };
      },
    }),
  ],
});
```

- A model id `internal/v2` routes to the provider named `internal` and sends `model: "v2"` in the request. An id whose provider is not registered makes the plugin throw at load time.
- `requiredEnv` lists the variables the provider needs. The plugin checks them, after applying the `env` renames, before calling `decide`; when one is missing it warns once and reports nothing for that model (or fails the run in CI with `ci: "fail"`).
- `env` in the `decide` input is the rename map from settings, not the values. Read `process.env[env[name] ?? name]` yourself.

## The `decide` contract

- `decide` is synchronous because oxlint rules are. A provider that calls a network service must block on a worker thread, as the built-in provider does with [synckit](https://github.com/un-ts/synckit); returning a Promise is not supported.
- Input: `{ request, timeoutMs, env }`. `request` is an OpenRouter Decisions request: `model`, `state` (`snippets` keyed by match id, optional `contexts`), and `questions`, each `{ type: "noul", instructions }` or `{ type: "choice", instructions, criteria }`.
- Output: `{ ok: true, response }` with a Decisions response body, or `{ ok: false, reason }`. A failure is a warning (or a CI failure), never an exception; do not throw from `decide`.
- Respect `timeoutMs`; it is the remaining per-file budget.
- Optional `decideAll(inputs)` gets every model of one file for this provider at once and returns one result per input, in the same order. Send them concurrently there; without it the plugin calls `decide` once per model, one after another. A result count that differs from the input count fails every input of that call.

Check: run oxlint with `OXLINT_DECISION_EXPLAIN=1`. Each match should show your model id and a probability, not an `error` line.

# oxlint-plugin-decision

> [!WARNING]
> This package is experimental. Use at your own risk.

[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) rules written in plain English, answered by decision models on [OpenRouter](https://openrouter.ai).

A rule is a question about a function, a call, a JSX element, or a whole file. Each match is sent to one or more decision models with the question, and the plugin reports an error when the answer the rule cares about clears its cutoff.

Decision models do not write text. They return a probability for a yes/no question, or pick one of the options you list. That makes them fast and cheap enough to run over a codebase, and it is why every rule here is a question with a fixed set of answers.

This is a fork of [oxlint-plugin-jev](https://github.com/wobsoriano/oxlint-plugin-jev) by [Robert Soriano](https://github.com/wobsoriano), rebuilt on the OpenRouter Decisions API.

## Install

```sh
npm i -D oxlint oxlint-plugin-decision
export OPENROUTER_API_KEY="..."   # https://openrouter.ai/settings/keys
```

The plugin reads the key from the `OPENROUTER_API_KEY` environment variable. Without it, the plugin warns once and reports nothing.

In CI, set `ci: "fail"` so a run that could not reach a model fails instead of passing quietly.

## Config

Add the plugin and its one rule, `decision/ask`, to `.oxlintrc.json`. Your English rules go in the options.

```json
{
  "jsPlugins": ["oxlint-plugin-decision"],
  "rules": {
    "decision/ask": [
      "error",
      {
        "model": "openrouter/~typesafe/jev-latest",
        "rules": [
          {
            "id": "no-pii-in-logs",
            "target": "call",
            "question": "Does this call write personal data, such as an email or phone number, to a log or console?",
            "cutoff": 0.8
          },
          {
            "id": "name-matches-behavior",
            "target": "function",
            "question": "Does this function's name imply it only reads data, while its body also writes or sends something?",
            "cutoff": 0.6,
            "context": { "scope": "enclosing", "kind": "class" }
          }
        ]
      }
    ]
  }
}
```

### Rules

| Field      | What it is                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| `id`       | Shown in the error message. Unique in the list.                                                         |
| `target`   | `"function"`, `"call"`, `"jsx"`, or `"file"`.                                                           |
| `question` | The question, in English. With the default answer kind, "yes" means "report this".                      |
| `cutoff`   | 0 to 1. The probability the reported answer needs, at or above.                                         |
| `answer`   | Optional. What kind of answer to ask for. See [Answers](#answers). Defaults to `{ "kind": "boolean" }`. |
| `context`  | Optional. Extra source the model reads around the match. See [Context](#context).                       |
| `model`    | Optional. Overrides the top-level `model` for this rule.                                                |
| `location` | Optional for file rules: a source-location `question` and a `cutoff` greater than 0.5 and at most 1.    |

`target` decides what the model gets to read. There is no selector syntax and no other target.

| Target       | The model sees                                                                                               | The error underlines |
| ------------ | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| `"function"` | The whole function. An arrow or method includes its name, so `const getUser = () => ...` reads as `getUser`. | The signature line   |
| `"call"`     | The whole call expression.                                                                                   | The whole call       |
| `"jsx"`      | The whole element, children included.                                                                        | The opening tag      |
| `"file"`     | The whole file.                                                                                              | The first line       |

The wording of the question is the rule, so be precise about what counts. "Does this send personal data" also fires on a legitimate `mailer.send(user.email, ...)`. "To a log or console" does not.

### Answers

Pick a kind. You never write a schema.

| Kind                | The model is asked                                 | Reported when                                                                |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `boolean` (default) | The probability that the answer is yes.            | That probability is at or above `cutoff`.                                    |
| `classify`          | To pick one of the `labels` you list.              | The chosen label is in `report` and its probability is at or above `cutoff`. |
| `severity`          | To rate the problem as none, info, warn, or error. | The rating is at or above `minimum` (default `"warn"`) and clears `cutoff`.  |

```json
{
  "id": "stale-comment",
  "target": "function",
  "question": "How does the comment right above this function relate to what the function does?",
  "cutoff": 0.7,
  "context": { "scope": "lines", "before": 5, "after": 0 },
  "answer": {
    "kind": "classify",
    "labels": {
      "accurate": "The comment describes what the code does",
      "stale": "The comment describes behavior the code no longer has",
      "redundant": "The comment repeats the code without adding anything"
    },
    "report": ["stale"]
  }
}
```

```json
{
  "id": "security-smell",
  "target": "function",
  "question": "Does this function handle untrusted input in a way that could be exploited?",
  "cutoff": 0.6,
  "answer": { "kind": "severity", "minimum": "warn" }
}
```

The message names the answer: `[stale-comment] openrouter/... answered stale (0.91 >= 0.70): ...`.

### Context

By default the model reads only the match. `context` sends more source with it, marked as background so the verdict still targets the match.

| Context                                         | Sent with the match                                        |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `{ "scope": "node" }` (default)                 | Nothing.                                                   |
| `{ "scope": "lines", "before": 5, "after": 5 }` | Numbered lines around the match. Both counts default to 5. |
| `{ "scope": "enclosing", "kind": "function" }`  | The nearest enclosing `function`, `class`, or `block`.     |
| `{ "scope": "file" }`                           | The whole file.                                            |

More context costs more tokens and is cached together with the match, so an edit anywhere in the context re-asks that file.

### Models

A model id is `<provider>/<model>`. The built-in provider is `openrouter`, so `openrouter/inception/mercury-decide` asks `inception/mercury-decide` on OpenRouter. Browse decision models at [openrouter.ai/models](https://openrouter.ai/models?output_modalities=decisions).

`model` takes one id or a list. With a list, every model answers every match, each model's request is separate, and each model's yes is its own diagnostic, so you can compare models on the same code.

```json
{ "model": ["openrouter/~typesafe/jev-latest", "openrouter/respan/span-01-lite"] }
```

Probabilities are not calibrated the same way across models, so a cutoff tuned for one model does not carry over to another. Pin a versioned id once your cutoffs are tuned. Each diagnostic names the model that answered.

A key is required only for providers your config references. `OPENROUTER_BASE_URL` points the plugin at another OpenRouter-compatible host.

### File locations

File rules can point editor diagnostics and GitHub annotations to the suspected violation:

```json
{
  "id": "prefer-boolean-state-helper",
  "target": "file",
  "question": "Does any boolean React state have a memoized callback that only sets it to true or false?",
  "cutoff": 0.9,
  "location": {
    "question": "Select the declaration of the state used by the offending callback.",
    "cutoff": 0.75
  }
}
```

The violation and location have separate cutoffs. An uncertain or invalid location keeps the finding on the first line. Files truncated by `maxSnippetChars` also keep the first-line diagnostic, since location questions only use complete source.

### Settings

| Setting             | Default                             | Meaning                                                                                                                                                |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci`                | `"skip"`                            | What happens when a model can't be asked and `CI` is set. `"skip"` warns once and reports nothing. `"fail"` fails the run. Outside CI it always skips. |
| `timeoutMs`         | `10000`                             | Per-file budget shared by every model's request, retries and location refinements.                                                                     |
| `maxMatchesPerFile` | `25`                                | Matches sent per file across all rules. Extra matches are dropped in source order and the file is named on stderr.                                     |
| `maxSnippetChars`   | `4000`                              | Longer snippets are cut and end with `/* ...truncated */`.                                                                                             |
| `model`             | `"openrouter/~typesafe/jev-latest"` | The default model id or list of ids.                                                                                                                   |

## Rules and providers in code

`createDecisionPlugin` builds a plugin with rules and providers defined in JavaScript. Export it from a local file and list that file in `jsPlugins`.

```js
// decision-plugin.mjs
import { createDecisionPlugin, defineDecisionRule, defineProvider } from "oxlint-plugin-decision";

export default createDecisionPlugin({
  name: "team",
  rules: [
    defineDecisionRule({
      id: "no-swallowed-catch",
      target: "function",
      question: "Does this function catch an error and neither handle nor rethrow it?",
      cutoff: 0.8,
      context: { scope: "lines", before: 3, after: 3 },
    }),
  ],
  providers: [
    defineProvider({
      name: "internal",
      requiredEnv: ["INTERNAL_DECIDER_KEY"],
      decide: ({ request, timeoutMs }) => ({
        ok: true,
        response: callYourDecider(request, timeoutMs),
      }),
    }),
  ],
});
```

```json
{
  "jsPlugins": ["./decision-plugin.mjs"],
  "rules": { "team/ask": ["error", { "model": "internal/v2" }] }
}
```

Rules from code come first, then rules from the config. Oxlint checks config rules against the plugin's JSON schema; rules from code are checked with the same constraints when linting starts.

A provider's `decide` is synchronous, because oxlint rules are. It gets an OpenRouter Decisions request (`model`, `state`, `questions`) and returns `{ ok: true, response }` with a Decisions response, or `{ ok: false, reason }`. The built-in `openRouter` provider does its network call on a worker thread through [synckit](https://github.com/un-ts/synckit); a custom provider that calls a network service should do the same.

Types for all of this are exported: `DecisionRule`, `DecisionOptions`, `RuleAnswer`, `RuleContext`, `DecisionProvider`, `DecisionRequest`, `DecideResult`, and more.

## How it works

Each file gets one request per model, with every match for that model in it. A file rule with `location` adds numbered source and a choice question. Above 254 nonblank lines the model selects a range and refines it in follow-up requests with the same context. All requests share the per-file `timeoutMs` budget.

Answers are cached under `node_modules/.cache/oxlint-plugin-decision`, keyed by the endpoint and the request. Changing a snippet, its context, a question or an answer kind re-asks that file. Changing a cutoff or an `id` does not. Malformed answers are never cached, and malformed entries already on disk are asked again.

Requests go through the official [`@openrouter/sdk`](https://www.npmjs.com/package/@openrouter/sdk) client, which retries rate limits and server errors within `timeoutMs`.

If a model can't be asked, because the key is missing, the request times out, or the API errors, the plugin prints one warning and reports nothing for that model on that file. Set `ci: "fail"` to fail the run instead.

If only a location refinement fails, confirmed violations are still reported at the file level. Under CI with `ci: "fail"`, the refinement failure produces a separate diagnostic; otherwise it warns.

## Cost and caching

Every match is a paid model request unless its answer is already cached, so keep an eye on what your rules match.

- A broad target, such as `"call"` on a large codebase, sends many matches. `maxMatchesPerFile` caps how many are sent per file.
- Wider `context` and longer snippets cost more tokens. `maxSnippetChars` caps each snippet.
- A list of models multiplies the requests: each model answers every match.
- Answers are cached on disk under `node_modules/.cache/oxlint-plugin-decision`. Unchanged code is not asked again, so a second run over the same files is free. Editing a snippet, its context, a question or an answer kind re-asks that file; changing a cutoff or an `id` does not.
- In CI, persist `node_modules/.cache/oxlint-plugin-decision` between runs to keep the cache warm.
- Free models such as `openrouter/respan/span-01-lite` are a cheap way to try rules before switching to a paid model.

## In the editor

The oxlint VS Code extension lints as you type, and every keystroke inside a match is a paid request that blocks the language server until the model answers.

Keep `decision/ask` out of the config your editor reads, and put it in an overlay for CI and pre-push. Leave `jsPlugins` in the base config, since the overlay inherits it.

```json
{
  "extends": [".oxlintrc.json"],
  "rules": {
    "decision/ask": ["error", { "rules": [ ... ] }]
  }
}
```

```sh
oxlint                        # editor and local runs, no models
oxlint -c .oxlintrc.ci.json   # CI and pre-push, models included
```

## Example

Three rules that a pattern-based linter can't express, and code each one fails and passes on. The rules are the ones in the [Config](#config) section plus a prompt-injection check.

| Rule                    | Fails on                                                | Passes on                                   |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `no-pii-in-logs`        | `console.log("loaded", user.email, user.phone)`         | `console.log("notified", { userId: id })`   |
| `name-matches-behavior` | `getUser` that also sends an email                      | The same body named `notifySignIn`          |
| `no-prompt-injection`   | A customer message pasted into the system prompt string | The message passed as a separate user field |

## License

MIT

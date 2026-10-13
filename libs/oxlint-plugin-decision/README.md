# @r_masseater/oxlint-plugin-decision

> [!WARNING]
> This package is experimental. Use at your own risk.

[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) rules written in plain English, answered by decision models on [OpenRouter](https://openrouter.ai).

A rule is a question about a function, a call, a JSX element, or a whole file. Each match is sent to one or more decision models with the question, and the plugin reports an error when the answer the rule cares about clears its cutoff.

Decision models do not write text. They return a probability for a yes/no question, or pick one of the options you list. That makes them fast and cheap enough to run over a codebase, and it is why every rule here is a question with a fixed set of answers.

For ready-made rules, see [`@r_masseater/oxlint-plugin-decision-presets`](https://www.npmjs.com/package/@r_masseater/oxlint-plugin-decision-presets).

This is a fork of [oxlint-plugin-jev](https://github.com/wobsoriano/oxlint-plugin-jev) by [Robert Soriano](https://github.com/wobsoriano), rebuilt on the OpenRouter Decisions API.

## Install

```sh
npm i -D oxlint @r_masseater/oxlint-plugin-decision
export OPENROUTER_API_KEY="..."   # https://openrouter.ai/settings/keys
```

The plugin reads the key from the `OPENROUTER_API_KEY` environment variable. Without it, the plugin warns once and reports nothing. To read the key from a variable with another name, set `env` (see [Settings](#settings)). The key itself is never passed in code or config.

In CI (when the `CI` environment variable is set), a run that could not reach a model fails instead of passing quietly. Set `ci: "skip"` to only warn there too.

## Write your rules

The plugin ships no rules of its own. You write each rule with `defineDecisionRule` in a plugin file of your own, pass them to `createDecisionPlugin`, and load that file from `oxlint.config.ts`. For ready-made rules, use [`@r_masseater/oxlint-plugin-decision-presets`](https://www.npmjs.com/package/@r_masseater/oxlint-plugin-decision-presets).

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
    defineDecisionRule({
      id: "name-matches-behavior",
      target: "function",
      question:
        "Does this function's name describe only reading or fetching data (for example get, find, load or fetch), while its body also writes, logs or sends something?",
      cutoff: 0.8,
      context: { scope: "enclosing", kind: "class" },
    }),
  ],
});
```

Each rule becomes an oxlint rule named `<plugin name>/<rule id>`, so you turn rules on and set their severity one by one, like any other oxlint rule. The plugin name defaults to `decision`.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./decision-plugin.mjs"],
  rules: {
    "team/no-pii-in-logs": "error",
    "team/name-matches-behavior": "warn",
  },
});
```

The rules you turn on share one request per file and model, so turning on more rules does not add requests.

### Rules

| Field      | What it is                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`       | The oxlint rule name after `<plugin name>/`. Lowercase words joined by hyphens, unique in the plugin.                |
| `target`   | `"function"`, `"call"`, `"jsx"`, or `"file"`.                                                                        |
| `question` | The question, in English. With the default answer kind, "yes" means "report this".                                   |
| `cutoff`   | 0.8 to 1. The probability the reported answer needs, at or above.                                                    |
| `message`  | Optional. A short sentence the error shows instead of the question.                                                  |
| `select`   | Optional. A function of the AST node that says whether to ask about it. See [Selecting matches](#selecting-matches). |
| `answer`   | Optional. What kind of answer to ask for. See [Answers](#answers). Defaults to `{ kind: "boolean" }`.                |
| `context`  | Optional. Extra source the model reads around the match. See [Context](#context).                                    |
| `model`    | Optional. Overrides the plugin's `model` for this rule. See [Rule options](#rule-options).                           |
| `location` | Optional for file rules: a source-location `question` and a `cutoff` from 0.8 to 1.                                  |

`target` decides what the model gets to read. There is no selector syntax and no other target; `select` narrows a target down by looking at the AST.

| Target       | The model sees                                                                                               | The error underlines |
| ------------ | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| `"function"` | The whole function. An arrow or method includes its name, so `const getUser = () => ...` reads as `getUser`. | The signature line   |
| `"call"`     | The whole call expression.                                                                                   | The whole call       |
| `"jsx"`      | The whole element, children included.                                                                        | The opening tag      |
| `"file"`     | The whole file.                                                                                              | The first line       |

The wording of the question is the rule, so be precise about what counts. "Does this send personal data" also fires on a legitimate `mailer.send(user.email, ...)`. "To a log or console" does not.

### Selecting matches

`select` decides from the AST which matches are worth a question, before any request is sent. It gets the matched ESTree node, as oxlint parsed it, and returns `true` to ask about it. Matches it rejects cost nothing.

The second argument carries `context`, the oxlint rule context, and `name`, the match's name as source text, or `undefined` when it has none:

| Target       | `name`                                                                      |
| ------------ | --------------------------------------------------------------------------- |
| `"function"` | The function's own name, or the binding, property, or method that holds it. |
| `"call"`     | The callee as written, such as `console.error` or `it.only`.                |
| `"jsx"`      | The tag name, such as `Button` or `motion.div`.                             |
| `"file"`     | Always `undefined`.                                                         |

```js
defineDecisionRule({
  id: "pure-name-is-pure",
  target: "function",
  select: (node, { name }) => name !== undefined && name.startsWith("compute"),
  question:
    "This function's name presents it as a pure computation, but its body changes state outside itself or performs I/O.",
  message: "The name promises a pure computation, but the body has side effects.",
  cutoff: 0.8,
});

defineDecisionRule({
  id: "test-proves-its-name",
  target: "call",
  select: (node) =>
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    ["it", "test"].includes(node.callee.name),
  question: "Would this test still pass if the behaviour its name claims were broken?",
  cutoff: 0.8,
});
```

### Answers

Pick a kind. You never write a schema.

| Kind                | The model is asked                                 | Reported when                                                                |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `boolean` (default) | The probability that the answer is yes.            | That probability is at or above `cutoff`.                                    |
| `classify`          | To pick one of the `labels` you list.              | The chosen label is in `report` and its probability is at or above `cutoff`. |
| `severity`          | To rate the problem as none, info, warn, or error. | The rating is at or above `minimum` (default `"warn"`) and clears `cutoff`.  |

```js
defineDecisionRule({
  id: "stale-comment",
  target: "function",
  question: "How does the comment right above this function relate to what the function does?",
  cutoff: 0.8,
  context: { scope: "lines", before: 5, after: 0 },
  answer: {
    kind: "classify",
    labels: {
      accurate: "The comment describes what the code does",
      stale: "The comment describes behavior the code no longer has",
      redundant: "The comment repeats the code without adding anything",
    },
    report: ["stale"],
  },
});
```

```js
defineDecisionRule({
  id: "security-smell",
  target: "function",
  question: "Does this function handle untrusted input in a way that could be exploited?",
  cutoff: 0.8,
  answer: { kind: "severity", minimum: "warn" },
});
```

The message names the answer: `[stale-comment] openrouter/... answered stale (0.91 >= 0.70): ...`.

### Context

By default the model reads only the match. `context` sends more source with it, marked as background so the verdict still targets the match.

| Context                                    | Sent with the match                                        |
| ------------------------------------------ | ---------------------------------------------------------- |
| `{ scope: "node" }` (default)              | Nothing.                                                   |
| `{ scope: "lines", before: 5, after: 5 }`  | Numbered lines around the match. Both counts default to 5. |
| `{ scope: "enclosing", kind: "function" }` | The nearest enclosing `function`, `class`, or `block`.     |
| `{ scope: "file" }`                        | The whole file.                                            |
| `{ scope: "comment" }`                     | See below.                                                 |

`{ scope: "comment" }` is for rules about the comment above the code. The match is sent starting at the comments directly above it (or above the `export` or declaration that holds it), with nothing between them but whitespace. A match without such a comment is not asked about.

More context costs more tokens and is cached together with the match, so an edit anywhere in the context re-asks that file.

### Models

A model id is `<provider>/<model>`. The built-in provider is `openrouter`, so `openrouter/inception/mercury-decide` asks `inception/mercury-decide` on OpenRouter. Browse decision models at [openrouter.ai/models](https://openrouter.ai/models?output_modalities=decisions).

`model` takes one id or a list. With a list, every model answers every match, each model's request is separate, and each model's yes is its own diagnostic, so you can compare models on the same code.

```js
createDecisionPlugin({
  model: ["openrouter/~typesafe/jev-latest", "openrouter/respan/span-01-lite"],
  rules: [ ... ],
});
```

Respan models, such as `openrouter/respan/span-01-lite`, answer only yes/no questions, so the plugin splits every choice into yes/no questions for them:

- `classify` asks whether each label fits and picks the label with the highest yes probability.
- `severity` asks whether the match is at least `info`, at least `warn`, and at least `error`, and picks the most serious level with a yes probability of 0.8 or more. A level's probability is never below that of a more serious level.
- File-rule `location` asks about each candidate line. It finds clear cases, but is less precise than on the default model.

The probability in the message is the yes probability of the picked label or level. Respan models are also asked about one match per request, so they send more requests than other models on files with many matches. The default `openrouter/~typesafe/jev-latest` answers every answer kind in one question.

Probabilities are not calibrated the same way across models, so a cutoff tuned for one model does not carry over to another. Pin a versioned id once your cutoffs are tuned. Each diagnostic names the model that answered.

A key is required only for providers the rules you turned on use. `OPENROUTER_BASE_URL` points the plugin at another OpenRouter-compatible host.

### File locations

File rules can point editor diagnostics and GitHub annotations to the suspected violation:

```js
defineDecisionRule({
  id: "prefer-boolean-state-helper",
  target: "file",
  question:
    "Does any boolean React state have a memoized callback that only sets it to true or false?",
  cutoff: 0.9,
  location: {
    question: "Select the declaration of the state used by the offending callback.",
    cutoff: 0.8,
  },
});
```

The violation and location have separate cutoffs. An uncertain or invalid location keeps the finding on the first line. Files truncated by `maxSnippetChars` also keep the first-line diagnostic, since location questions only use complete source.

### Settings

Settings apply to the whole plugin, not to one rule. Pass them to `createDecisionPlugin`, or put them under `settings.<plugin name>` in `oxlint.config.ts`. Values in the config file win, so one plugin file can run with different settings in different configs.

```js
createDecisionPlugin({ name: "team", timeoutMs: 20_000, rules: [ ... ] });
```

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./decision-plugin.mjs"],
  settings: {
    team: {
      model: "openrouter/respan/span-01-lite",
    },
  },
  rules: {
    "team/no-pii-in-logs": "error",
  },
});
```

| Setting           | Default                             | Meaning                                                                                                                                                |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci`              | `"fail"`                            | What happens when a model can't be asked and `CI` is set. `"fail"` fails the run. `"skip"` warns once and reports nothing. Outside CI it always skips. |
| `timeoutMs`       | `10000`                             | Per-file budget shared by every model's request, retries and location refinements.                                                                     |
| `maxSnippetChars` | `4000`                              | Longer snippets are cut and end with `/* ...truncated */`.                                                                                             |
| `model`           | `"openrouter/~typesafe/jev-latest"` | The default model id or list of ids.                                                                                                                   |
| `env`             | `{}`                                | Renames the environment variables providers read, such as `{ "OPENROUTER_API_KEY": "TEAM_OPENROUTER_KEY" }`. Values are variable names, not keys.      |
| `explain`         | `false`                             | `true` or `"text"` prints why each match was or wasn't reported, `"json"` prints the same as JSON Lines. See [Explain mode](#explain-mode).            |

## Explain mode

When you tune a question or try another model, explain mode shows why each match was or wasn't reported. Turn it on for one run with an environment variable, since oxlint does not pass command-line flags to plugins:

```sh
OXLINT_DECISION_EXPLAIN=1 npx oxlint      # readable text
OXLINT_DECISION_EXPLAIN=json npx oxlint   # one JSON object per match
```

You can also set `explain: true` (or `"json"`) in `createDecisionPlugin` or in `settings.<plugin name>`. The environment variable wins when it is set, and `OXLINT_DECISION_EXPLAIN=0` turns it off.

For every match the plugin asked a model about, it prints to stderr, so oxlint's own output stays as it is:

```text
oxlint-plugin-decision explain: fail.js:5:3 [no-pii-in-logs] openrouter/respan/span-01-lite (served openrouter/respan/span-01-lite-20260925) cached=no 412ms
  state: 64 chars "state.snippets.s3: console.log(\"loaded\", user.email, user.ph"
  s3: yes=0.93
    Consider only snippet "s3" in state.snippets. Does this call write personal data, such as an email or phone number, to a log or console?
  verdict: yes 0.93, cutoff 0.80, reported
```

- The file and position, the rule, the model id the rule was asked with (after any per-rule override), and the model that served the answer.
- Whether the answer came from the cache, and how long the plugin waited for the answers of that file, in milliseconds. Every model of a file is asked together, so they share one wait.
- The length and first characters of the source sent as state. The full source is not printed.
- Each question exactly as sent, with the probability of each answer. When a Respan model answers a `classify` or `severity` rule, each yes/no question it was asked is listed on its own.
- The verdict, the rule's cutoff, and whether it was reported.

If the request failed, the record says why instead. In JSON Lines the same fields are `file`, `line`, `column`, `rule`, `model`, `served`, `cutoff`, `cached`, `durationMs`, `state`, `questions`, `verdict`, `reported`, and `error`.

Explain mode only prints. It does not change what is asked, what is cached, or what is reported.

### Rule options

Each rule also takes options in `oxlint.config.ts`, next to its severity. They change only that rule, so one config can run different rules on different models.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./decision-plugin.mjs"],
  settings: {
    team: {
      model: "openrouter/respan/span-01-lite",
    },
  },
  rules: {
    "team/no-pii-in-logs": "error",
    "team/name-matches-behavior": [
      "warn",
      {
        model: "openrouter/~typesafe/jev-latest",
      },
    ],
  },
});
```

| Option  | Meaning                                  |
| ------- | ---------------------------------------- |
| `model` | A model id or list of ids for this rule. |

A rule's model comes from the first of these that sets one: the rule's options in `oxlint.config.ts`, the rule's own `model`, `settings.<plugin name>.model`, the `model` passed to `createDecisionPlugin`, and the default.

Rules on different models are asked separately, one request per file and model, so a Respan model and `~typesafe/jev-latest` can share a config: each model gets only the matches of the rules that use it. Answers are cached by the request each model receives, so rules never share or overwrite each other's cached answers.

## Providers

`createDecisionPlugin` also takes providers, so rules can ask a decision service other than OpenRouter.

```js
// decision-plugin.mjs
import {
  createDecisionPlugin,
  defineDecisionRule,
  defineProvider,
} from "@r_masseater/oxlint-plugin-decision";

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

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./decision-plugin.mjs"],
  settings: {
    team: {
      model: "internal/v2",
    },
  },
  rules: {
    "team/no-swallowed-catch": "error",
  },
});
```

`createDecisionPlugin` checks every rule and setting when the plugin loads, so a typo in a rule fails the oxlint run instead of being ignored.

A provider's `decide` is synchronous, because oxlint rules are. It gets an OpenRouter Decisions request (`model`, `state`, `questions`) and returns `{ ok: true, response }` with a Decisions response, or `{ ok: false, reason }`. The built-in `openRouter` provider does its network call on a worker thread through [synckit](https://github.com/un-ts/synckit); a custom provider that calls a network service should do the same.

oxlint runs JS plugins on one thread, so files are asked one after another. Within a file, the plugin hands every model of the same provider to the provider's optional `decideAll` in one call, and the built-in provider sends them at the same time. A provider without `decideAll` is asked one model at a time through `decide`.

The built-in provider's worker reports its `decide`, `ask` and `send` steps as spans over OTLP when the standard `OTEL_TRACES_EXPORTER=otlp` and `OTEL_EXPORTER_OTLP_ENDPOINT` (or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) are set, and does nothing otherwise.

Types for all of this are exported: `DecisionRule`, `DecisionOptions`, `RuleAnswer`, `RuleContext`, `DecisionProvider`, `DecisionRequest`, `DecideResult`, and more.

## How it works

Each file gets one request per model, with every match for that model in it. Respan models get one request per match instead, with each choice question split into yes/no questions. A file rule with `location` adds numbered source and a choice question. Above 254 nonblank lines the model selects a range and refines it in follow-up requests with the same context. All requests share the per-file `timeoutMs` budget.

Answers are cached under `node_modules/.cache/oxlint-plugin-decision`, keyed by the endpoint and the request. Changing a snippet, its context, a question or an answer kind re-asks that file. Changing a cutoff or an `id` does not. Malformed answers are never cached, and malformed entries already on disk are asked again. See [Cost and caching](https://github.com/masseater/oxlint-plugin-decision#cost-and-caching) for how to keep the cost down.

Requests go through the official [`@openrouter/sdk`](https://www.npmjs.com/package/@openrouter/sdk) client, which retries rate limits and server errors within `timeoutMs`.

If a model can't be asked, because the key is missing, the request times out, or the API errors, the plugin prints one warning and reports nothing for that model on that file. Under CI the run fails instead, unless `ci` is `"skip"`.

If only a location refinement fails, confirmed violations are still reported at the file level. Under CI (unless `ci` is `"skip"`), the refinement failure produces a separate diagnostic; otherwise it warns.

## In the editor

The oxlint VS Code extension lints as you type, and every keystroke inside a match is a paid request that blocks the language server until the model answers.

Keep your decision rules off in the config your editor reads, and turn them on in an overlay for CI and pre-push. Leave `jsPlugins` in the base config, since the overlay inherits it.

```ts
// oxlint.ci.config.ts
import { defineConfig } from "oxlint";

import base from "./oxlint.config.ts";

export default defineConfig({
  extends: [base],
  rules: {
    "team/no-pii-in-logs": "error",
    "team/name-matches-behavior": "error",
  },
});
```

```sh
oxlint                          # editor and local runs, no models
oxlint -c oxlint.ci.config.ts   # CI and pre-push, models included
```

## Example

Three rules that a pattern-based linter can't express, and code each one fails and passes on. The rules are the ones in [Write your rules](#write-your-rules) plus a prompt-injection check, defined in [`example/plugin.mjs`](example/plugin.mjs).

| Rule                    | Fails on                                                | Passes on                                   |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `no-pii-in-logs`        | `console.log("loaded", user.email, user.phone)`         | `console.log("notified", { userId: id })`   |
| `name-matches-behavior` | `getUser` that also sends an email                      | The same body named `notifySignIn`          |
| `no-prompt-injection`   | A customer message pasted into the system prompt string | The message passed as a separate user field |

## License

MIT.

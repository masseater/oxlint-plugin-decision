---
name: write-decision-rules
description: >
  Use when writing, wiring up, or debugging lint rules for @r_masseater/oxlint-plugin-decision: rules
  phrased as plain-English questions that OpenRouter decision models answer about functions, calls,
  JSX elements, or whole files in an Oxlint run. Covers defineDecisionRule, createDecisionPlugin,
  enabling the rules in oxlint.config.ts, select, answer kinds, context, per-rule models, settings,
  explain mode, and keeping request cost under control. Also use when someone wants a lint check
  that a pattern-based linter cannot express. Not for choosing or enabling the ready-made rules in
  @r_masseater/oxlint-plugin-decision-presets.
metadata:
  purpose: >
    Teach an agent to author decision rules with @r_masseater/oxlint-plugin-decision, load them into
    Oxlint, tune their questions and cutoffs, and avoid the mistakes that silently report nothing or
    send far more paid requests than intended.
  type: core
  library: "@r_masseater/oxlint-plugin-decision"
  library_version: 0.0.1
sources:
  - src/**
  - README.md
  - example/**
---

# Write decision rules

The package ships no rules. You write each rule as a yes/no (or pick-one) question with `defineDecisionRule`, bundle the rules with `createDecisionPlugin` in a plugin file of your own, load that file through `jsPlugins` in `oxlint.config.ts`, and turn each rule on by name. Decision models return probabilities, never text, so a rule cannot produce an explanation or a fix.

## Setup

1. Install the plugin next to Oxlint (`oxlint` >= 1.87.0 is a peer dependency):

   ```sh
   npm i -D oxlint @r_masseater/oxlint-plugin-decision
   export OPENROUTER_API_KEY="..."
   ```

   Result: `OPENROUTER_API_KEY` is set in the shell that runs oxlint. Without it the plugin warns once and reports nothing outside CI, and fails the run in CI.

2. Write a plugin file that default-exports `createDecisionPlugin`:

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

3. Load the file and turn each rule on as `<plugin name>/<rule id>`:

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

   Result: `npx oxlint` lints with the rule. A rule that is defined but not listed under `rules` never sends a request. The plugin name defaults to `decision` when `name` is omitted.

`createDecisionPlugin` validates every rule and setting when the plugin loads and throws on a bad value, so a typo fails the oxlint run instead of being ignored.

## Core Patterns

### Pick the target and phrase the question

| `target`     | The model reads                                          | The error underlines |
| ------------ | -------------------------------------------------------- | -------------------- |
| `"function"` | The whole function; arrows and methods include the name. | The signature line   |
| `"call"`     | The whole call expression.                               | The whole call       |
| `"jsx"`      | The whole element, children included.                    | The opening tag      |
| `"file"`     | The whole file.                                          | The first line       |

There is no other target and no selector syntax. With the default `boolean` answer, "yes" means "report this", so phrase the question so that yes is the violation. The wording is the rule: "Does this send personal data" also fires on a legitimate `mailer.send(user.email, ...)`, while "to a log or console" does not. Questions and messages are English sentences. `message` replaces the question in the diagnostic with a short sentence.

Rule fields: `id` (lowercase words joined by hyphens, unique in the plugin), `target`, `question`, `cutoff` (0 to 1, inclusive), and optional `message`, `select`, `answer`, `context`, `model`, and `location` (file rules only).

### Narrow matches with `select` before any request

`select(node, { name, context })` gets the ESTree node oxlint parsed and returns `true` to ask about it. Rejected matches cost nothing. `name` is the function's own or binding name, the callee as written (`console.error`, `it.only`), or the JSX tag name; it is `undefined` for file rules and for anonymous matches.

```js
defineDecisionRule({
  id: "test-proves-its-name",
  target: "call",
  select: (node) =>
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    ["it", "test"].includes(node.callee.name),
  question: "Would this test still pass if the behaviour its name claims were broken?",
  cutoff: 0.7,
});
```

Use `select` for structure the AST already answers; leave judgement to the question.

### Choose the answer kind

```js
// classify: report when the picked label is in `report` and its probability clears cutoff
defineDecisionRule({
  id: "stale-comment",
  target: "function",
  question: "How does the comment right above this function relate to what the function does?",
  cutoff: 0.7,
  context: { scope: "comment" },
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

// severity: report when the rating is at least `minimum` (default "warn") and clears cutoff
defineDecisionRule({
  id: "security-smell",
  target: "function",
  question: "Does this function handle untrusted input in a way that could be exploited?",
  cutoff: 0.6,
  answer: { kind: "severity", minimum: "warn" },
});
```

The kinds are `boolean` (default), `classify`, and `severity`. You never write a schema.

### Send surrounding source with `context`

| `context`                                  | Sent with the match                                    |
| ------------------------------------------ | ------------------------------------------------------ |
| `{ scope: "node" }` (default)              | Nothing.                                               |
| `{ scope: "lines", before: 5, after: 5 }`  | Numbered lines around the match; both default to 5.    |
| `{ scope: "enclosing", kind: "function" }` | The nearest enclosing `function`, `class`, or `block`. |
| `{ scope: "file" }`                        | The whole file.                                        |
| `{ scope: "comment" }`                     | The match starting at the comments directly above it.  |

With `{ scope: "comment" }`, a match without a comment directly above it (or above the `export` or declaration holding it) is not asked about at all. Wider context costs more tokens, and an edit anywhere in the context re-asks that file.

### Point a file rule at a line

A `"file"` rule can add `location: { question, cutoff }` to move the diagnostic from the first line to the suspected violation. The location `cutoff` must be greater than 0.5 and at most 1. An uncertain location, or a file cut by `maxSnippetChars`, keeps the first-line diagnostic.

### Set models and plugin settings

Settings apply to the whole plugin: pass them to `createDecisionPlugin` or put them under `settings.<plugin name>` in `oxlint.config.ts`; the config file wins.

| Setting           | Default                             | Meaning                                                                                  |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `model`           | `"openrouter/~typesafe/jev-latest"` | Model id `<provider>/<model>`, or a list; every listed model answers every match.        |
| `ci`              | `"fail"`                            | When `CI` is set and a model can't be asked: `"fail"` fails the run, `"skip"` warns.     |
| `timeoutMs`       | `10000`                             | Per-file budget shared by every request, retry, and location refinement.                 |
| `maxSnippetChars` | `4000`                              | Longer snippets are cut and end with `/* ...truncated */`.                               |
| `env`             | `{}`                                | Renames variables providers read, e.g. `{ OPENROUTER_API_KEY: "TEAM_KEY" }`. Names only. |
| `explain`         | `false`                             | `true`/`"text"` or `"json"` prints why each match was or wasn't reported, to stderr.     |

A rule's model comes from the first of: the rule's options in `oxlint.config.ts` (`["warn", { model: "openrouter/respan/span-01-lite" }]`), the rule's own `model`, `settings.<plugin name>.model`, the `model` passed to `createDecisionPlugin`, then the default.

When tuning a question or cutoff, or switching models, read [tuning rules](references/tuning.md) first.

When the rules must ask a decision service other than OpenRouter, read [custom providers](references/providers.md) before writing one.

## Common Mistakes

### HIGH: the API key is put in code or config

```js
// Wrong: there is no apiKey setting; createDecisionPlugin rejects unknown keys
createDecisionPlugin({ name: "team", apiKey: process.env.KEY, rules });

// Right: export OPENROUTER_API_KEY, or rename the variable the provider reads
createDecisionPlugin({ name: "team", env: { OPENROUTER_API_KEY: "TEAM_OPENROUTER_KEY" }, rules });
```

Keys are read only from environment variables; `env` values are variable names, not keys (`src/options.ts`, `src/runtime.ts`).

### HIGH: a broad target on a whole codebase

Every match is a paid request unless cached, and the plugin has no per-file cap, budget, include/exclude, or changed-files option. A `"call"` rule without `select` asks about every call in every linted file. Narrow with `select`, scope files and rules with oxlint `overrides`, and lint only changed files by passing their paths to oxlint. A list of models multiplies the requests.

### HIGH: decision rules on in the editor config

The oxlint editor extension lints on every keystroke, and each edit inside a match is a request that blocks the language server. Keep decision rules off in the config the editor reads and enable them in an overlay used for CI and pre-push:

```ts
// oxlint.ci.config.ts
import { defineConfig } from "oxlint";

import base from "./oxlint.config.ts";

export default defineConfig({
  extends: [base],
  rules: { "team/no-pii-in-logs": "error" },
});
```

Run it with `oxlint -c oxlint.ci.config.ts`. Keep `jsPlugins` in the base config so the overlay inherits it.

### MEDIUM: a question where "yes" means "fine"

"Is this function named well?" reports the well-named functions. With the `boolean` answer, ask about the violation, or use `classify` with `report` listing only the bad labels.

### MEDIUM: rule ids that are not lowercase-hyphenated or are repeated

`id` must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and be unique within the plugin, and `rules` must list at least one rule; otherwise loading the plugin throws (`src/options.ts`).

## Completion

1. Run `npx oxlint` (or the CI overlay) on a file that should fail and one that should pass. Result: the failing file gets a diagnostic like `[no-pii-in-logs] openrouter/... answered yes (0.93 >= 0.80): ...`; the passing file gets none.
2. If nothing is reported, run once with `OXLINT_DECISION_EXPLAIN=1` and check stderr: a missing match means the target, `select`, or `context: { scope: "comment" }` excluded it; an `error` line means the key, timeout, or API failed; a low probability means the question or cutoff needs tuning (see [tuning rules](references/tuning.md)).
3. If the plugin fails to load, fix the rule or setting the thrown error names; do not remove validation.

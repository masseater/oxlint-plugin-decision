# oxlint-plugin-decision — Skill Spec

`@r_masseater/oxlint-plugin-decision` is an Oxlint JS plugin whose rules are plain-English questions answered by decision models on OpenRouter. The package ships no rules; developers write them with `defineDecisionRule` and `createDecisionPlugin`. `@r_masseater/oxlint-plugin-decision-presets` ships ready-made rules on top of it.

## Domains

| Domain         | Description                                                                | Skills               |
| -------------- | -------------------------------------------------------------------------- | -------------------- |
| rule-authoring | Writing decision rules, loading them into Oxlint, tuning what they report. | write-decision-rules |

## Skill Inventory

| Skill                | Type | Domain         | What it covers                                                                                                      | Failure modes |
| -------------------- | ---- | -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------- |
| write-decision-rules | core | rule-authoring | defineDecisionRule, createDecisionPlugin, oxlint.config.ts wiring, select, answers, context, settings, models, cost | 5             |

## Failure Mode Inventory

### write-decision-rules (5 failure modes)

| #   | Mistake                                   | Priority | Source                          | Cross-skill? |
| --- | ----------------------------------------- | -------- | ------------------------------- | ------------ |
| 1   | API key passed in code or config          | HIGH     | src/options.ts                  | —            |
| 2   | Broad target without select               | HIGH     | root README.md#cost-and-caching | —            |
| 3   | Decision rules enabled in the editor      | HIGH     | README.md#in-the-editor         | —            |
| 4   | Question where yes means the code is fine | MEDIUM   | README.md#rules                 | —            |
| 5   | Rule id not lowercase-hyphenated/repeated | MEDIUM   | src/options.ts                  | —            |

## Subsystems & Reference Candidates

| Skill                | Subsystems | Reference candidates                                                      |
| -------------------- | ---------- | ------------------------------------------------------------------------- |
| write-decision-rules | —          | references/providers.md (custom providers), references/tuning.md (tuning) |

## Remaining Gaps

| Skill   | Question                                              | Status |
| ------- | ----------------------------------------------------- | ------ |
| presets | Whether the presets package should ship its own skill | open   |

## Coverage and batch history

- 2026-10-11, first batch, source at `57a674a` (package version 0.0.1). The maintainer asked for skills on the API package (`libs/oxlint-plugin-decision`) only, so the presets package has no skill. One core skill, `write-decision-rules`, covers the whole rule-authoring task, with conditional references for custom providers and tuning, because a developer writing a rule needs targets, answers, context, settings and cost together. Checks: `intent validate` passed. Fresh-consumer task evaluation was not run and remains unverified.
- 2026-10-12, review scope and checks: `skill_tree.yaml` `review.ignore` lists repository tooling, the presets package, and the API package's build config and unrelated tests, so `intent maintainer check` asks for a skill review only when the API package's `src/`, `README.md`, `example/` or the skill's task check change. CI runs Intent's generated `check-skills.yml` (pinned to the v0.5.5 commit, `node-version: '26'` to match the repository's engines). `vp run skills:check` runs the same validation and check locally. Task check: `libs/oxlint-plugin-decision/tests/skills/write-decision-rules/task.md` with the executable check `libs/oxlint-plugin-decision/tests/skill-write-decision-rules.test.ts` (the repository's flat test layout), run against the mock OpenRouter server: the skill's setup reports the failing file only, an API key in the plugin setup fails the run, and a rule that is not turned on sends no request. All three pass.
- 2026-10-12, fresh-consumer run: an isolated agent session in a disposable npm project with the packed package (`npm i` of the `vp pm pack` tarball), `@tanstack/intent` 0.5.5, `intent.skills: ["@r_masseater/oxlint-plugin-decision"]` and `intent install` guidance, given only the task in `task.md`. It found the skill with `intent list`, loaded it with `intent load @r_masseater/oxlint-plugin-decision#write-decision-rules`, did not need the references, and wrote `decision-plugin.mjs` (plugin `team`, rule `no-pii-in-logs` on `call` with a `select` narrowing to method calls) and `oxlint.config.ts` enabling `team/no-pii-in-logs`. Without a key the run warned and passed; with `CI=1` it failed on the missing key, so the rule was registered and enabled. No key was written to the files. It also relayed the editor-overlay advice. Real model answers were not exercised in that run (no key); one run only, no reliability claim.

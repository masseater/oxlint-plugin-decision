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

| #   | Mistake                                   | Priority | Source                     | Cross-skill? |
| --- | ----------------------------------------- | -------- | -------------------------- | ------------ |
| 1   | API key passed in code or config          | HIGH     | src/options.ts             | —            |
| 2   | Broad target without select               | HIGH     | README.md#cost-and-caching | —            |
| 3   | Decision rules enabled in the editor      | HIGH     | README.md#in-the-editor    | —            |
| 4   | Question where yes means the code is fine | MEDIUM   | README.md#rules            | —            |
| 5   | Rule id not lowercase-hyphenated/repeated | MEDIUM   | src/options.ts             | —            |

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
- 2026-10-12, review scope: `skill_tree.yaml` `review.ignore` lists repository tooling, the presets package, and the API package's tests and build config, so `intent maintainer check` (run by `vp run verify`) asks for a skill review only when the API package's `src/`, `README.md` or `example/` change. The check runs inside `verify` instead of Intent's `check-skills.yml`, which calls an external reusable workflow.

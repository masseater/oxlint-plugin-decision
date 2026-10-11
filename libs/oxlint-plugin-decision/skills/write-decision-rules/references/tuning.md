# Tuning rules

Read this when a rule reports too much or too little, or before switching a rule to another model.

## See why each match was or wasn't reported

```sh
OXLINT_DECISION_EXPLAIN=1 npx oxlint      # readable text on stderr
OXLINT_DECISION_EXPLAIN=json npx oxlint   # one JSON object per match
```

oxlint does not pass flags to plugins, so explain mode is an environment variable (or `explain: true` / `"json"` in settings; the variable wins, and `OXLINT_DECISION_EXPLAIN=0` turns it off). Each record shows the file and position, rule, requested and served model, whether the answer was cached, the start of the source sent, every question exactly as sent with its probability, the verdict, and the cutoff. A failed request shows its reason instead. Explain mode only prints; it changes nothing that is asked, cached, or reported.

## Adjust the question before the cutoff

1. Write one file that must fail and one that must pass, close to each other (the same body with a different name, for example).
2. Run explain mode on both. If the yes probabilities overlap, the question is ambiguous: reword it to name exactly what counts and what doesn't. Changing only the cutoff cannot separate overlapping cases.
3. When the two separate, set `cutoff` between them. Result: the failing file is reported and the passing file is not.

A changed question, snippet, context, or answer kind re-asks that file. A changed `cutoff` or `id` reuses the cache, so cutoff tuning is free after the first run.

## Switching or mixing models

- Probabilities are not calibrated the same across models; re-tune cutoffs after switching, and pin a versioned model id once tuned.
- `openrouter/respan/span-01-lite` is free and a cheap way to try rules. Respan models answer yes/no only: the plugin splits `classify` into one yes/no per label (highest yes wins), `severity` into "at least info/warn/error" (the most serious level at 0.5 or above wins), and asks about one match per request.
- Override one rule's model in `oxlint.config.ts` without touching the plugin file: `"team/stale-comment": ["warn", { model: "openrouter/~typesafe/jev-latest" }]`. Rules on different models are asked in separate requests and cached separately.

## Cache

Answers are cached under `node_modules/.cache/oxlint-plugin-decision`, keyed by endpoint and request. Unchanged code is not asked again. Persist that directory between CI runs to keep it warm. Malformed answers are never cached.

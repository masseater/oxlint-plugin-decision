# Task: flag personal data written to logs

A team wants Oxlint to fail when code writes personal data, such as an email address or phone number, to a log or console. A pattern-based rule can't tell `console.log(user.email)` from `console.log({ userId: id })`, so they want a plain-English rule answered by a decision model with `@r_masseater/oxlint-plugin-decision`.

Starting point: a project with `fail.js` (logs `user.email` and `user.phone`) and `pass.js` (logs only an id). Oxlint and the plugin are installed and `OPENROUTER_API_KEY` is set.

Done when:

- `oxlint -c oxlint.config.ts` reports `fail.js` under a `team/<rule id>` diagnostic and reports nothing for `pass.js`.
- The API key is not written into the plugin file or the config.
- A rule that is defined but not turned on in `oxlint.config.ts` sends no request.

`tests/skill-write-decision-rules.test.ts` checks the expected solution and the mistakes the skill warns about, against a mock OpenRouter server.

# Contributing

The workspace is TypeScript and [Effect](https://effect.website), built with [Vite+](https://viteplus.dev) (`vp`) on Node 26. Use `vp` for installs, builds and tests rather than calling pnpm or npm directly. ESM only.

The plugin lives in [`libs/oxlint-plugin-decision`](libs/oxlint-plugin-decision).

## Setup

```sh
vp install
```

## Checks

```sh
vp run verify   # build, format, lint, typecheck, mock tests, workflow lint, fallow
```

The lint runs the `recommended` preset from the built `libs/oxlint-plugin-decision-presets/dist` against `libs/*/src` with Span-01 Lite, so build before `vp check` and set `OPENROUTER_API_KEY`. Without the key the decision rules only warn locally; in CI they fail.

Inside the package:

```sh
vp run build
vp check            # format, lint, typecheck
vp run test         # against a mock OpenRouter server; writes coverage/coverage-final.json, which fallow uses to fail any function with a CRAP score of 5 or more
OPENROUTER_API_KEY=... vp run test:live   # the example against Span-01 Lite, a free model; checks it reports exactly fail.js's three violations and logs every answer's probability
```

## Example

`libs/oxlint-plugin-decision/example/` holds a file that fails the example rules and a file that passes them. Run the example against a real model with:

```sh
vp run --filter @r_masseater/oxlint-plugin-decision example
```

`OPENROUTER_BASE_URL` points the plugin at another host; the tests use it for a mock server.

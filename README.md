# oxlint-plugin-decision

> [!WARNING]
> This package is experimental. Use at your own risk.

Oxlint rules written in plain English, answered by decision models on OpenRouter.

The package lives in [`libs/oxlint-plugin-decision`](libs/oxlint-plugin-decision), and its [README](libs/oxlint-plugin-decision/README.md) covers installing, configuring and extending it.

This is a fork of [oxlint-plugin-jev](https://github.com/wobsoriano/oxlint-plugin-jev) by [Robert Soriano](https://github.com/wobsoriano).

## Development

The workspace uses [Vite+](https://viteplus.dev) (`vp`) on Node 26.

```sh
vp install
vp run verify   # format, lint, typecheck, build, mock tests, workflow lint, fallow
```

## License

[MIT](LICENSE)

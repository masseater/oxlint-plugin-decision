# Changelog

## [0.0.4](https://github.com/masseater/oxlint-plugin-decision/compare/v0.0.3...v0.0.4) (2026-10-12)


### Features

* OpenRouter のアプリをリポジトリと実行元（CI / Claude Code cloud / Claude Code / local）ごとに分ける ([#52](https://github.com/masseater/oxlint-plugin-decision/issues/52)) ([8f036a1](https://github.com/masseater/oxlint-plugin-decision/commit/8f036a1c0e33b50bd39f0a5e8967e99d7cafb1fc))


### Bug Fixes

* keep decision answers across CI runs and name the app on OpenRouter ([#51](https://github.com/masseater/oxlint-plugin-decision/issues/51)) ([1c0055e](https://github.com/masseater/oxlint-plugin-decision/commit/1c0055efc91d8ce74421415ce5159779ee37ce41))
* **release:** release the fix commits and stop parsing an empty PR output ([#48](https://github.com/masseater/oxlint-plugin-decision/issues/48)) ([aad2ba6](https://github.com/masseater/oxlint-plugin-decision/commit/aad2ba67f3df3de57ee05b53d1aee197e6059293))
* **release:** run up-to-date on the release PR before merging it ([#53](https://github.com/masseater/oxlint-plugin-decision/issues/53)) ([c069053](https://github.com/masseater/oxlint-plugin-decision/commit/c069053b221f2e56ba2cb9d777b314a748a00c69))

## [0.0.3](https://github.com/masseater/oxlint-plugin-decision/compare/v0.0.2...v0.0.3) (2026-10-12)


### Bug Fixes

* pass OPENROUTER_API_KEY to the publish workflow's verify ([#42](https://github.com/masseater/oxlint-plugin-decision/issues/42)) ([06e6fd8](https://github.com/masseater/oxlint-plugin-decision/commit/06e6fd8ebbaf844dd3508ad94e4d8f4fa72eff7e))
* **release:** release the fix commits and stop parsing an empty PR output ([#45](https://github.com/masseater/oxlint-plugin-decision/issues/45)) ([fed219c](https://github.com/masseater/oxlint-plugin-decision/commit/fed219c8952493aa3351ab902866dadc9795a507))

## [0.0.2](https://github.com/masseater/oxlint-plugin-decision/compare/v0.0.1...v0.0.2) (2026-10-12)


### ⚠ BREAKING CHANGES

* remove maxMatchesPerFile and send every match ([#24](https://github.com/masseater/oxlint-plugin-decision/issues/24))
* **presets:** sort the jev-lint rules into strict and review-only ([#26](https://github.com/masseater/oxlint-plugin-decision/issues/26))
* select matches with a function of the AST instead of nameMatches ([#22](https://github.com/masseater/oxlint-plugin-decision/issues/22))
* fail under CI by default when a model can't be asked ([#19](https://github.com/masseater/oxlint-plugin-decision/issues/19))
* register each decision rule as its own oxlint rule and drop decision/ask ([#10](https://github.com/masseater/oxlint-plugin-decision/issues/10))

### Features

* answer classify and severity rules on Respan models ([#9](https://github.com/masseater/oxlint-plugin-decision/issues/9)) ([35756a9](https://github.com/masseater/oxlint-plugin-decision/commit/35756a9f6981d258942fa588e66670ae3e356f77))
* explain why each match was or wasn't reported ([#17](https://github.com/masseater/oxlint-plugin-decision/issues/17)) ([8c10039](https://github.com/masseater/oxlint-plugin-decision/commit/8c100393687336a8034323976eec2eba2f2b1574))
* fail under CI by default when a model can't be asked ([#19](https://github.com/masseater/oxlint-plugin-decision/issues/19)) ([010c6c9](https://github.com/masseater/oxlint-plugin-decision/commit/010c6c9a9b6f7381afc4efac474171829c1ec6c6))
* let env rename the variables providers read the API key and base URL from ([#13](https://github.com/masseater/oxlint-plugin-decision/issues/13)) ([38b0dfc](https://github.com/masseater/oxlint-plugin-decision/commit/38b0dfc79e126fbcbd6982d13c2f4358951d15ad))
* override a rule's model from its oxlint rule options ([#16](https://github.com/masseater/oxlint-plugin-decision/issues/16)) ([557cd22](https://github.com/masseater/oxlint-plugin-decision/commit/557cd2299320cf58bb364db6737cbbeba8a557d1))
* **presets:** add domain-naming and prefer-schema-validation ([#20](https://github.com/masseater/oxlint-plugin-decision/issues/20)) ([ef6afcf](https://github.com/masseater/oxlint-plugin-decision/commit/ef6afcf22856cd78db8f5b76e56f0de54e823056))
* **presets:** add the ai-slop entry for padding coding agents leave behind ([#23](https://github.com/masseater/oxlint-plugin-decision/issues/23)) ([d4cd93e](https://github.com/masseater/oxlint-plugin-decision/commit/d4cd93ee57f387de0d858ff7eda086cfc1e97bd3))
* **presets:** add the jev-lint rules as the jev entry ([#21](https://github.com/masseater/oxlint-plugin-decision/issues/21)) ([f3ec81c](https://github.com/masseater/oxlint-plugin-decision/commit/f3ec81c6c6356a932d7a33e743800bfcb0299997))
* **presets:** flag schemas that hand-copy an imported library's types ([#32](https://github.com/masseater/oxlint-plugin-decision/issues/32)) ([600e2c4](https://github.com/masseater/oxlint-plugin-decision/commit/600e2c43c1337a00b5bb58e32a444f62f8e88c17))
* **presets:** sort the jev-lint rules into strict and review-only ([#26](https://github.com/masseater/oxlint-plugin-decision/issues/26)) ([7773da4](https://github.com/masseater/oxlint-plugin-decision/commit/7773da4fb1c05292127534d8f7ea1dfecda601cf))
* register each decision rule as its own oxlint rule and drop decision/ask ([#10](https://github.com/masseater/oxlint-plugin-decision/issues/10)) ([4bd8c2c](https://github.com/masseater/oxlint-plugin-decision/commit/4bd8c2c94cf255ff9eec14dc5f9406d52f3764f3))
* remove maxMatchesPerFile and send every match ([#24](https://github.com/masseater/oxlint-plugin-decision/issues/24)) ([57a674a](https://github.com/masseater/oxlint-plugin-decision/commit/57a674a2d3ff7174b2c7de2390f3cfbccde0a50d))
* select matches with a function of the AST instead of nameMatches ([#22](https://github.com/masseater/oxlint-plugin-decision/issues/22)) ([1add398](https://github.com/masseater/oxlint-plugin-decision/commit/1add398333804ed6f0ea89e480be84fd29e702b2))
* ship an agent skill with the API package through TanStack Intent ([#30](https://github.com/masseater/oxlint-plugin-decision/issues/30)) ([646b46f](https://github.com/masseater/oxlint-plugin-decision/commit/646b46f950c861d665b21c03f894f5e5b313cf51))

<!-- intent-maintainer:start -->

## Library Skill Maintenance

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before substantial library source, documentation, examples, tests, or skill work, run `vp exec intent meta generate-skill` and follow the packaged maintainer procedure.
Use the current request and repository evidence. For initial skills, propose a useful batch and reuse any scope already agreed with the maintainer.
Before handing off a skill batch or library change, run `vp exec intent maintainer review --json`. Follow the maintainer procedure to update affected guidance, run task checks, and record completed review outcomes. Report an evidence-backed no-op or missing evidence explicitly.
Create and incrementally maintain domain_map.yaml, skill_spec.md, and skill_tree.yaml in the established artifact location for every skill batch. Preserve prior tasks, maintainer decisions, and remaining work.
Keep maintainer decisions and changes in the repository; do not require the user to repeat the procedure in later sessions.
Use intent maintainer setup to initialize missing records, maintainer add to register skills, maintainer status to identify work, and maintainer sync to update generated metadata. Finish with intent maintainer check.
<!-- intent-maintainer:end -->

## 配置

- ワークスペースはnxに倣ってapps・libs・tools・infraに分ける。参照してよい向きは、libsをapps・tools・infraから、appsをinfraからだけである。apps同士、tools同士、infra同士も参照しない。fallowのboundariesが落とす。

## 計測

- 推測するな、計測しろ。仮説を立てたら、実装や修正の前に計測で事実を確かめ、その結果だけで判断する。
- 機能開発に取り掛かる前に、AIが自分でデバッグできる仕組みを必ず作る。再現手段、ログやスパン、その出力を読む経路の3つである。
- 時間かお金を使う処理（モデルへのリクエスト、子プロセス、ファイルの入出力など）は、すべてスパンにして外から読めるようにする。スパンはEffect公式の `OtlpTracer.layerFromConfig` で出し、標準の `OTEL_TRACES_EXPORTER=otlp` と `OTEL_EXPORTER_OTLP_ENDPOINT` が設定されたときだけ送る。Effect は `OTEL_TRACES_EXPORTER` が無いと送らない。
- スパンは時間を使っている処理そのものに仕込む。計測のためだけにコマンドやプロセスを包まない。
- 判定と所要時間は `OXLINT_DECISION_EXPLAIN=json` で読む。oxlint のルールごとの時間は `--debug=timings` で読む。
- 判断の根拠にする計測は、実際のモデルに問い合わせる lint で行う。モックのテストは計る仕組みが動くかを確かめるためだけに使う。

## マージ

- マージ前に必ず base ブランチを取り込み、手元の `vp run verify` を通してからマージする。コンフリクトしないからといって、取り込まないままマージしない。マージしてよいかは聞かない。

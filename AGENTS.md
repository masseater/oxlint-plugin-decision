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

- ワークスペースは apps・libs・tools・infra に分ける。
- 定数・設定値・スキーマ・ルールの ID は一か所で定義し、ほかはそこから参照する。

## 計測

- 推測せず計測する。実装や修正の前に事実を確かめ、その結果だけで判断する。
- 機能開発の前に、AI が自分でデバッグできる仕組み（再現手段、ログやスパン、それを読む経路）を作る。
- 時間かお金を使う処理はすべてスパンにし、`OtlpTracer.layerFromConfig` で出す。計測のためだけにコマンドやプロセスを包まない。
- 判定と所要時間は `OXLINT_DECISION_EXPLAIN=json`、oxlint のルールごとの時間は `--debug=timings` で読む。
- 判断の根拠にする計測は、実際のモデルに問い合わせる lint で行う。モックのテストは計る仕組みの確認だけに使う。

## 脆弱性

- `audit` は `vp pm audit --fix` で直す。修正版の無い勧告だけを `auditConfig.ignoreGhsas` に載せ、理由をコミットメッセージに書く。

## マージ

- マージ前に base を取り込み、手元の `vp run verify` を通してから自分でマージする。マージしてよいかは聞かない。ルールセットのバイパスや `--admin` は使わない。
- release-please のリリース PR は `verify` を手動実行して作り直す。`up-to-date` が承認待ちで取り込むものも無ければ、ユーザーに承認を頼む。

## 公開先

- デプロイ先や外部公開しているもの（サイト、API、npm パッケージなど）があれば、その URL を README に一覧で載せる。

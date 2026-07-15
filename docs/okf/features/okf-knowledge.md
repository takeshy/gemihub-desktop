---
type: Product Feature
title: OKF知識ソース
description: YAML frontmatter付きMarkdownのknowledge bundleを選択し、curatedな定義・関係・手順をChatのsystem contextへ追加する機能。
tags: [okf, knowledge, chat, context]
timestamp: 2026-07-15T00:00:00+09:00
---

Open Knowledge Format（OKF）は、1ファイルを1概念として整理するvendor-neutralなMarkdown knowledge bundleです。各concept fileはYAML frontmatterに `type` を持ち、推奨fieldとして `title`、`description`、`tags` を使います。bundle rootの `index.md` は概念一覧です。

# GemiHub Desktopでの利用

製品機能ガイドは `GemiHub Desktop Help` built-in bundleとして常にselectorへ表示され、外部OKF rootを設定せず利用できます。他の知識を追加する場合は次の手順で外部bundleを登録します。

1. OKF bundleをWorking directory内に用意する。既定の検索rootは `Knowledge`。
2. OKF settingsで検索rootを設定する。
3. `index.md` を持つbundleを検出する。
4. ChatのOKF selectorで参照したいbundleをactiveにする。

active bundleについては、**bundle内の`index.md`の内容だけ**が毎回system promptへ追加されます。個々のconceptファイルの本文は最初から注入されるわけではなく、AIが`read_okf_document`というtoolを呼び出して、bundleIdと`index.md`に書かれているpathを指定したときだけ、その1文書の全文を取得します。これはAgent SkillのWorkflowを`run_skill_workflow`で必要な時だけ実行する仕組みと同じ考え方で、常時の送信量を抑えつつ、必要な詳細だけを都度取りに行かせる設計です。

`GemiHub Desktop Help` built-in bundleの文書はアプリと一緒にレビュー済みのため、`read_okf_document`で取得する本文は全文です。外部bundleの本文は1ファイルあたり最大20,000文字までに制限されます。`log.md`はどちらの場合もpathで直接指定しても取得できません。1bundleの文書数上限（built-in bundleは24）は、あくまでbundle内に置ける文書ファイル数の上限であり、system promptへ注入される量とは別の話です。

OKFはcurated knowledge向けです。全文検索が必要な大量資料には[Local RAG](/features/local-rag.md)を使います。

# 外部bundleを作るときの注意

`index.md`はAIが最初に見る唯一の手がかりになるため、単なる目次ではなく「目的から探す」ような分類と、各文書への正しいpath・簡潔な説明を必ず書いてください。AIはここに書かれたpathを頼りに`read_okf_document`を呼び出すため、リンク切れやpathの誤りがあると詳細を取得できません。1ファイル1概念の原則を保ち、`type`・`title`・`description`は各文書のfrontmatterに省略せず設定してください（`read_okf_document`で取得した文書のtitle表示に使われます）。

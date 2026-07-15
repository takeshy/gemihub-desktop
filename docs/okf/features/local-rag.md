---
type: Product Feature
title: Local RAG
description: 指定したローカル文書をchunk化・embeddingして索引を作り、Chatから意味検索する機能。
tags: [rag, retrieval, embeddings, search]
timestamp: 2026-07-15T00:00:00+09:00
---

Local RAGは、ローカルファイル群を意味検索できるようにするretrieval機能です。`Settings > Local retrieval`でRAG settingを作り、対象path、embedding provider、modelなどを設定してSyncします。索引とvectorはローカルに保存されます。

# 操作

* Sync: 対象ファイルを読み、text chunkとembeddingを更新する。
* Status: 文書数、chunk数、更新状態を確認する。
* Search: queryに近いchunkをscore付きで取得する。
* Adjacent chunks: ヒット前後の文脈を追加取得する。
* Delete index: 作成済み索引を削除する。

embedding生成には設定したproviderのcredentialが必要で、GeminiやVertex AIなど外部embedding APIを使う場合、対象テキストがそのサービスへ送信されます。RAGは原文そのものを変更しません。少数ファイルを確実に渡す用途は `@file`、curatedな定義や手順には[OKF](/features/okf-knowledge.md)が適しています。

# 既定値と処理の単位

既定はchunk sizeが500文字、overlapが100文字、検索時のtop-kは5件、score threshold 0.3、embedding providerは既定でGeminiです。embeddingは32chunkずつまとめて要求され、1回のSyncで処理する変更ファイル数は最大50件です。50件を超える変更があった場合は一部が次回以降のSyncへ持ち越されます（結果に持ち越し件数が表示されます）。ファイル内容はhashで比較され、変更がなければ再embeddingをskipします。embedding providerやmodel、chunk設定を変更すると全体が再構築されます。

# 索引対象の範囲

現状の索引対象は作業ディレクトリ配下の`.md`ファイルです（`.git`、`.llm-hub`、`node_modules`とsymlinkは対象外）。設定にはPDFのchunkページ数やmultimodal索引の項目がありますが、実際に索引されるかは環境・バージョンによって異なる場合があるため、PDFなど非Markdownを検索対象にしたい場合はSync後のStatusで文書数を確認し、期待通り増えているか確かめてください。

# 関連機能

[Chatのコンテキストとファイル操作](/features/chat-context-file-tools.md)、[OKF知識ソース](/features/okf-knowledge.md)、[Discord bot](/features/discord-bot.md)（`!rag on`/`!rag off`）。

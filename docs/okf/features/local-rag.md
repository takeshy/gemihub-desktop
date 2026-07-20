---
type: Product Feature
title: Local RAG
description: 指定したローカル文書をchunk化・embeddingして索引を作り、Chatから意味検索する機能。
tags: [rag, retrieval, embeddings, search]
timestamp: 2026-07-20T00:00:00+09:00
---

Local RAGは、ローカルファイル群を意味検索できるようにするretrieval機能です。`Settings > Local retrieval`でRAG settingを作り、対象path、embedding provider、modelなどを設定してSyncします。索引とvectorはローカルに保存されます。

# 操作

* Sync: 対象ファイルを読み、text chunkとembeddingを更新する。
* Status: 文書数、chunk数、更新状態を確認する。
* Search: queryに近いchunkをscore付きで取得する。
* Indexed files: 索引済みfileとchunk数を確認し、元fileを開く。
* Filter: file pathとchunk本文をtermで絞り込む。同じ行のtermはOR、複数行はAND、引用符内はphraseとして扱う。
* Select / Chat / Copy: 必要なchunkだけを選び、Chatへ渡すかclipboardへコピーする。
* Adjacent chunks: textの検索結果へ前後3chunkずつ追加して文脈を広げる。
* AI suggestions / refine: 設定済みmodelでfilter語を展開したり、選択する抜粋を整えたりする。
* Delete index: 作成済み索引を削除する。

embedding生成には設定したproviderのcredentialが必要で、GeminiやVertex AIなど外部embedding APIを使う場合、対象テキストがそのサービスへ送信されます。RAGは原文そのものを変更しません。少数ファイルを確実に渡す用途は `@file`、curatedな定義や手順には[OKF](/features/okf-knowledge.md)が適しています。

# 既定値と処理の単位

既定はchunk sizeが500文字、overlapが100文字、検索時のtop-kは5件、score threshold 0.3、embedding providerは既定でGeminiです。embeddingは32chunkずつまとめて要求され、backendの1回の処理単位は変更file最大50件です。RAG Search画面の **Sync Index** は持ち越しがなくなるまでこの処理を自動反復します。ファイル内容はhashで比較され、変更がなければ再embeddingをskipします。embedding providerやmodel、chunk設定を変更すると全体が再構築されます。

# 索引対象の範囲

索引対象はWorkspace配下のMarkdown、plain text、PDFです（`.git`、`.llm-hub`、`node_modules`とsymlinkは対象外）。PDFは通常のembedding modelでは抽出可能なtextを索引します。GeminiまたはVertex AIで `gemini-embedding-2` 系modelを使う場合はPDFをpage単位のmultimodal embeddingとして扱い、PNG/JPEG画像、MP3/WAV音声、MP4/MPEG動画も索引できます。binary形式の結果は展開すると対応するmedia previewを表示します。

検索時はTop K、score threshold、拡張子を一時的に指定できます。text結果のEdit画面で行う前後chunkの追加やAI Refine、Saveは、現在の検索結果としてChatへ渡す抜粋を編集する操作です。元fileと保存済みRAG indexは書き換えません。

# 関連機能

[Chatのコンテキストとファイル操作](/features/chat-context-file-tools.md)、[OKF知識ソース](/features/okf-knowledge.md)、[Discord bot](/features/discord-bot.md)（`!rag on`/`!rag off`）。

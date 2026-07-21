---
type: Product Feature
title: Chatのコンテキストとファイル操作
description: "`@file`、右クリックした選択範囲、ワークスペース検索をChatへ渡し、AIのファイル変更を確認後に適用する機能。"
tags: [chat, context, files, grounding]
timestamp: 2026-07-20T00:00:00+09:00
---

Chat入力で `@file` を使うとWorkspace内のローカルファイルを会話へ追加できます。文書内の文章を選択して右クリックメニューの「AIに相談」を選ぶと、選択した文章とファイル情報がChatの下書きへ追加されます。質問対象を明示すると、AIが一般論ではなく手元の文書に基づいて回答しやすくなります。

# File tools

API providerでは、設定したfile tool modeに応じてWorkspace内のファイルを読み、検索し、作成・編集・renameできます。変更を伴う操作はpending actionとして提示され、ユーザーの確認後にだけ適用されます。Workspace外へのpath traversalやsymlink escapeは拒否されます。Filesタブで一時表示している外部directoryはAI file toolsの対象にはなりません。

# 使い分け

* 1〜数ファイルを直接指定: `@file`
* 今見ている箇所について質問: 文章を選択して右クリックし「AIに相談」
* 多数の文書から関連箇所を検索: [Local RAG](/features/local-rag.md)
* 整理済みの製品・業務知識を常時参照: [OKF](/features/okf-knowledge.md)

# file toolの具体的な制限

file tool modeには`all`（全tool）、`noSearch`（検索・一覧toolを除く）、`none`（file tool無し）があります。有効なtoolには以下の制限があります。

* ファイル読み込みは約20万文字で打ち切られ、超過分は末尾に`[truncated]`と表示されます。大きなファイルはAIに全文を読ませられない場合があります。
* ファイル検索は指定がなければ既定30件、一覧取得は最大1000件までを返します。
* 変更提案には置換のほか追記・先頭追加のmodeがあり、いずれも実際の書き込みはユーザーが確認するまで行われません。
* ノート作成では、ファイル名にpath区切りを含められません（folderは別項目で指定します）。

# 確認と適用

AIによるファイル作成・編集・renameの提案はpending actionとして表示され、確認して初めてディスクへ反映されます。適用された変更は通常の保存と同様に[履歴](/features/file-history-trash.md)の対象になるため、意図しない変更は履歴から復元できます。Plugin/Workflowが登録したcustom toolをAIが呼ぶ場合、フロントエンド側の応答待ちには最大10分のタイムアウトがあります。

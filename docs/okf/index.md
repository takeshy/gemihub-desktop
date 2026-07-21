# GemiHub Desktop 機能ガイド

このOKFバンドルは、GemiHub Desktopのユーザー向け機能、設定方法、主要な制約をまとめたものです。チャットで操作方法を回答するときは、該当する機能ページを優先して参照してください。

## 最初に行うこと

1. 必要なら `Settings > General` でWorkspace directoryを変更する。
2. 単独起動では最後のタブ、フォルダ、Dashboardが復元される。関連付けでファイルを開くと、そのフォルダがFilesタブへ表示される。
3. `+ Add Widget` または `Ctrl/Cmd + P` でファイルを開く。
4. AIを使う場合は `Settings > AI features` を設定する。引用メモはWorkspace内の `Memos/` へ自動保存される。

DashboardやWorkflow、pluginなどのアプリ資産を置く場所がWorkspaceです。Filesタブは関連付けで開いたファイルのフォルダを一時表示します。AI file toolsとChatのfile attachment pickerはWorkspaceを対象にし、引用メモはWorkspaceの `Memos/` に保存されます。

## 目的から探す

* 手元の資料を読む・編集する: [ファイル管理](/features/file-management.md)、[ドキュメントビューア](/features/document-viewers.md)
* 読書中の引用を残す: [引用付きメモ](/features/document-memos.md)
* Markdown群を一覧・ボード化する: [Base](/features/bases.md)、[Kanban](/features/kanban.md)
* 定型作業を自動化する: [Workflow](/features/workflows.md)、[Workflow自動実行](/features/workflow-automation.md)
* AIへ特定ファイルや知識を渡す: [Chatのコンテキスト](/features/chat-context-file-tools.md)、[OKF](/features/okf-knowledge.md)、[Local RAG](/features/local-rag.md)
* 外部サービスや拡張機能を接続する: [MCP](/features/mcp-apps.md)、[Plugins](/features/plugins.md)

## 共通の安全原則

ファイル変更、外部送信、任意コード実行は同じものではありません。AIのfile toolsは変更前に確認を求めますが、Workflow、MCP、Plugin、Local CLIはそれぞれ独自の権限と実行経路を持ちます。第三者から入手した定義やコードは、対象ファイル、network access、command/scriptの有無を確認してから有効化してください。重要なファイルは履歴に加えて別媒体にもバックアップしてください。

## このバンドルの有効化

配布版では、このガイドは `GemiHub Desktop Help` というbuilt-in bundleとして常に利用できます。Chat入力欄の本アイコンから選ぶと、会話のcurated contextとして参照されます。source checkoutのMarkdownを外部bundleとして確認するときだけ、このリポジトリをFiles directoryにし、`Settings > Local retrieval > OKF knowledge bundles`のrootへ `docs/okf` を設定します。

## ワークスペースとドキュメント

* [WorkspaceとFilesタブ](/features/workspace-files.md) - Workspace資産と関連付けで開いたファイルの扱い。
* [ファイル管理](/features/file-management.md) - ファイルを開く方法、FileTree、外部エディタ、保存とエクスポート。
* [ドキュメントビューア](/features/document-viewers.md) - PDF、EPUB、HTML、テキスト、画像の表示。
* [Markdown編集](/features/markdown-editing.md) - Preview、WYSIWYG、Rawの編集モードと拡張記法。
* [引用付きメモ](/features/document-memos.md) - 選択範囲からメモを作り、本文と相互ジャンプする方法。

## 構造化ワークスペース

* [Dashboard](/features/dashboards.md) - 複数widgetを配置し、可搬な画面を作る機能。
* [Base](/features/bases.md) - Markdownファイルを検索・計算してtable、cards、listで表示する機能。
* [Kanban](/features/kanban.md) - Markdown frontmatterをカードの状態として扱うボード。
* [JSON Canvas](/features/json-canvas.md) - ノードと接続線を視覚的に編集するキャンバス。
* [Timeline](/features/timeline.md) - Markdownで保存される個人用マイクロブログwidget。

## 自動化とデータ保護

* [Workflow](/features/workflows.md) - YAMLで定義した処理を実行し、結果とログを確認する機能。
* [Workflow自動実行](/features/workflow-automation.md) - ファイルイベントを契機にWorkflowを実行する機能。
* [履歴・複製・Trash](/features/file-history-trash.md) - 変更履歴、復元、複製、安全な削除。
* [暗号化とSecret Manager](/features/encryption-secret-manager.md) - `.encrypted` ファイルと履歴暗号化。

## AIと拡張

* [Chat](/features/ai-chat.md) - 任意で有効にするAIチャットと会話履歴。
* [AI providerとLocal CLI](/features/ai-providers-cli.md) - OpenAI互換、Gemini、Vertex AI、Anthropic、CLIの設定。
* [Chatのコンテキストとファイル操作](/features/chat-context-file-tools.md) - `@file`、選択範囲の「AIに相談」、確認付きファイル変更。
* [Local RAG](/features/local-rag.md) - ローカル文書の索引作成と意味検索。
* [Agent SkillsとSlash commands](/features/agent-skills-commands.md) - 再利用可能な手順とコマンド。
* [MCP serversとMCP Apps](/features/mcp-apps.md) - 外部ツールや対話UIをChat・Workflowへ接続。
* [OKF知識ソース](/features/okf-knowledge.md) - curated knowledge bundleをChatへ追加する機能。
* [Plugins](/features/plugins.md) - 権限宣言付き拡張機能の配置、インストール、更新。
* [Discord bot](/features/discord-bot.md) - 設定済みAIをDiscordから利用する機能。

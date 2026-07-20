---
type: Product Feature
title: AI Chat
description: 設定したAI provider、ローカル知識、Skills、MCPを組み合わせて会話する任意機能。
tags: [ai, chat, assistant, optional]
timestamp: 2026-07-20T00:00:00+09:00
---

AI Chatは任意機能です。`Settings > AI features > Use AI features`
を有効にしたときだけChat
viewとAI関連設定が表示されます。無効にしてもドキュメント閲覧・編集、Dashboard、メモなどの基本機能は利用できます。

# Chatで組み合わせられる機能

「この回答をメモして」「要点を記録して」のように明示的に依頼すると、Chatは`append_timeline`
application
toolを使って回答または自己完結した要約をWorkspaceの標準Timelineへ追記します。同じChat経路を使うDiscord
Botでも利用できます。

「今日なにをやった？」や特定日の活動を尋ねると、Chatは`read_timeline`で該当日の標準Timelineを確認してから回答します。Timelineの読み書きtoolは一般のfile
tool設定とは独立して利用できます。

- OpenAI互換、Gemini、Vertex AI、Anthropic、Local CLI
- `@file` と `{selection}` による文脈追加
- Local RAGとOKF knowledge source
- provider nativeのWeb Search
- Agent Skills、Slash commands、Workflow tools
- HTTP/stdio MCP serversとMCP Apps
- 確認付きのローカルファイル操作

会話はsessionとして保存され、providerから返るusageも表示できます。履歴はローカルに保存され、`Settings > Encryption`
で暗号化可能です。AIへ送信される内容は、選択したprovider、添付、active
knowledge、toolsによって変わるため、機密情報を含める前に設定を確認してください。

生成中は送信buttonがStopに変わり、API streamまたはLocal CLI
processをキャンセルできます。停止時点までに受信済みの本文やthinkingはsessionへ残ります。

# Web Search

入力欄の **Web** toggleを有効にすると、provider nativeのWeb
Searchを使用します。Local RAGの選択とは独立しており、Web Search中もWorkspace
file tools、custom tools、設定済みMCP
toolsを併用できます。検索結果にcitationが返るproviderでは、回答末尾へSources
linkを追加します。

GeminiとVertex
AIでは利用できます。OpenAI互換providerではOpenAIまたはxAIの公式endpoint、AnthropicではAnthropicの公式endpointが必要です。Local
CLI、非対応のcustom endpoint、image/video生成modelではtoggleが無効になります。

# 履歴の保存場所

Chat historyはWorkspace内の隠しstate
fileとして保存されます。session専用の別保存先はなく、Workflow
logなどの状態と同じWorkspaceにまとまります。

# Session単位の設定

chat sessionごとにactiveなSkillsとOKF bundleを別々に保持できるため、session
Aで有効にしたSkillがsession
Bには影響しません。usage表示にはinput/output/thinking/total/cached/tool
useの各token数が個別に含まれ、合計だけでなくどこにtokenが使われたかを確認できます。Chat
historyを暗号化している場合、キャッシュされたパスワードが見つからないとhistory読み込み時にパスワード入力を求められます。

アプリを起動したとき、保存済みsessionがある場合は新しい空のsessionを先頭に作ります。すでに空の
`New chat`
だけがある場合は重複して作りません。過去のsessionは削除されず、session一覧から開けます。

# 関連機能

[AI providerとLocal CLI](/features/ai-providers-cli.md)、[暗号化とSecret Manager](/features/encryption-secret-manager.md)、[Chatのコンテキストとファイル操作](/features/chat-context-file-tools.md)、[Agent SkillsとSlash commands](/features/agent-skills-commands.md)。

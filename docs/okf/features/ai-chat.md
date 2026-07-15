---
type: Product Feature
title: AI Chat
description: 設定したAI provider、ローカル知識、Skills、MCPを組み合わせて会話する任意機能。
tags: [ai, chat, assistant, optional]
timestamp: 2026-07-15T00:00:00+09:00
---

AI Chatは任意機能です。`Settings > AI features > Use AI features` を有効にしたときだけChat viewとAI関連設定が表示されます。無効にしてもドキュメント閲覧・編集、Dashboard、メモなどの基本機能は利用できます。

# Chatで組み合わせられる機能

* OpenAI互換、Gemini、Vertex AI、Anthropic、Local CLI
* `@file` と `{selection}` による文脈追加
* Local RAGとOKF knowledge source
* Agent Skills、Slash commands、Workflow tools
* HTTP/stdio MCP serversとMCP Apps
* 確認付きのローカルファイル操作

会話はsessionとして保存され、providerから返るusageも表示できます。履歴はローカルに保存され、`Settings > Encryption` で暗号化可能です。AIへ送信される内容は、選択したprovider、添付、active knowledge、toolsによって変わるため、機密情報を含める前に設定を確認してください。

# 履歴の保存場所

Chat historyはProject内の隠しstate fileとして保存されます。Projectを選択していない場合のみ、アプリ設定領域内のsession用stateへ保存され、この場合に限り他の状態（Workflow logなど）より先にhistoryだけが利用できます。つまりProjectを選ぶ・選ばないでhistoryの保存先が変わり、両者は自動的にはマージされません。「前の会話が見当たらない」ときは、Project選択状態が変わっていないか確認してください。

# Session単位の設定

chat sessionごとにactiveなSkillsとOKF bundleを別々に保持できるため、session Aで有効にしたSkillがsession Bには影響しません。usage表示にはinput/output/thinking/total/cached/tool useの各token数が個別に含まれ、合計だけでなくどこにtokenが使われたかを確認できます。Chat historyを暗号化している場合、キャッシュされたパスワードが見つからないとhistory読み込み時にパスワード入力を求められます。

# 関連機能

[AI providerとLocal CLI](/features/ai-providers-cli.md)、[暗号化とSecret Manager](/features/encryption-secret-manager.md)、[Chatのコンテキストとファイル操作](/features/chat-context-file-tools.md)、[Agent SkillsとSlash commands](/features/agent-skills-commands.md)。

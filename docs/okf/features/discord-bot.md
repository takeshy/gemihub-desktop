---
type: Product Feature
title: Discord bot
description: 設定済みAI provider、RAG、Skills、WorkflowsをDiscordのDMまたは許可channelから利用する機能。
tags: [discord, bot, ai, integrations]
timestamp: 2026-07-15T00:00:00+09:00
---

`Settings > Discord`でbot tokenと応答条件を設定すると、GemiHub Desktopで構成したAIをDiscordから利用できます。利用前に少なくとも1つの[AI provider](/features/ai-providers-cli.md)を設定してください。

# 主な設定

* 使用providerとmodel、system prompt、最大response length
* allowed channel IDsとallowed user IDs
* DMへ応答するか
* server channelでmentionを必須にするか
* Discordから使うRAG setting

起動中のbotはworkspace skillsとSkill Workflowsを利用できます。長いresponseはDiscordのmessage lengthに合わせて分割されます（最大2000文字、既定1900文字）。tokenはDiscord bot accountを操作できる機密情報なので、共有せず、必要なら[Secret Manager](/features/encryption-secret-manager.md)などで安全に管理してください。許可IDとmention条件を狭く設定し、意図しないuserやchannelからの実行を防いでください。

# Discord上のchat command

メッセージとして直接入力するコマンドがあります（アプリのSlash commandとは別物です）。`!help`、`!reset`（会話とCLI sessionをclear）、`!rag on` / `!rag off`（そのchannelのRAG利用切り替え）、`!model`（設定中のmodel表示）、`!skill`（利用可能なskill一覧と有効状態）、`!skill <name>`（skillの有効・無効切り替え）、`!skill off`（全skill無効化）が使えます。会話状態・active skill・RAG設定・CLI session idはDiscordのchannelごとに個別に保持されます。

# mention必須解除の注意

「server channelでmentionを必須にするか」をOFFにすると、Discord側で`Message Content`という特権intentが有効になっている必要があります。Discord Developer Portal側でこのintentを有効にしないままOFFにすると、bot接続がintent不足で失敗します。ONのまま運用するか、事前にDeveloper Portalの設定を確認してください。

# 関連機能

[AI providerとLocal CLI](/features/ai-providers-cli.md)、[Local RAG](/features/local-rag.md)（`!rag`コマンド）、[Agent SkillsとSlash commands](/features/agent-skills-commands.md)。

---
type: Product Feature
title: 暗号化とSecret Manager
description: 通常ファイルを自己完結型 `.encrypted` に変換し、秘密情報やChat・Workflow履歴をパスワードで保護する機能。
tags: [encryption, secrets, security, privacy]
timestamp: 2026-07-20T00:00:00+09:00
---

通常ファイルは元の形式情報を保持した自己完結型の `.encrypted`
ファイルへ変換できます。暗号化ファイルを開くにはpasswordが必要です。File
Widgetで復号したテキストは入力停止後、session
passwordを使って再暗号化して自動保存されます。暗号化されたbinary
previewはread-onlyです。

# Secret Manager

トップバーの鍵アイコンからWorkspace全体のSecret
Managerを開き、暗号化ファイルを作成、unlock、copy、updateできます。アプリlevelの画面として最大化中のfile
widgetより前面に表示されます。DashboardへSecret Manager
widgetを配置し、指定folderだけを管理することもできます。API
keyなどを平文Markdownへ置かずにWorkspace内で管理する用途を想定しています。

# 履歴の暗号化

`Settings > Encryption`で暗号化passwordを作成またはunlockし、Chat
historyとWorkflow logsを個別に暗号化できます。private
keyはpasswordで保護され、passwordはアプリ終了までmemoryにだけ保持されます。passwordを失うと復号できないため、安全な場所へ保管してください。

暗号化はバックアップの代替ではありません。必要な `.encrypted`
ファイル自体は別途バックアップしてください。

# 暗号化の仕組みとpublicメタデータ

内部的にはRSA-OAEP（2048bit、SHA-256）の鍵ペアを使い、本文はAES-256-GCMで暗号化します。private
keyはpassword由来のkeyで保護され、新しく作るv2形式はPBKDF2を60万回反復します。旧形式の10万回反復も読み込み互換性のため引き続き復号できます。`.encrypted`ファイルのYAML
frontmatterには`encrypted: true`と暗号化された`key`・`salt`のほか、任意で`description`と`publicMetadata`を設定でき、この2つはunlockしなくても平文のまま読めます。ファイルを識別するためのラベル用途に使い、機密内容そのものは書かないでください。

新規暗号化時に二重暗号化を避ける判定では、復号に必要な`key`と`salt`を持つ有効な構造かも確認します。そのため、通常のMarkdownが偶然
`encrypted: true`
で始まっていても暗号化操作自体は可能です。一方、viewerが暗号化fileとして開く初期判定は先頭の
`---\nencrypted: true`
markerを使うため、通常文書をこの形で始めるのは避けてください。

# 関連機能

[AI Chat](/features/ai-chat.md)・[Workflow](/features/workflows.md)（履歴暗号化は同じ鍵の仕組みを使います）、[Discord bot](/features/discord-bot.md)（tokenの保管先として推奨）。

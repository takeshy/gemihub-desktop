---
type: Product Feature
title: 暗号化とSecret Manager
description: 通常ファイルを自己完結型 `.encrypted` に変換し、秘密情報やChat・Workflow履歴をパスワードで保護する機能。
tags: [encryption, secrets, security, privacy]
timestamp: 2026-07-15T00:00:00+09:00
---

通常ファイルは元の形式情報を保持した自己完結型の `.encrypted` ファイルへ変換できます。暗号化ファイルを開くにはpasswordが必要です。復号した平文は自動保存されず、明示的にSaveしたときだけ再暗号化されます。

# Secret Manager

DashboardのSecret Manager widgetでは、指定folder内の暗号化ファイルを作成、unlock、copy、updateできます。API keyなどを平文Markdownへ置かずにWorkspace内で管理する用途を想定しています。

# 履歴の暗号化

`Settings > Encryption`で暗号化passwordを作成またはunlockし、Chat historyとWorkflow logsを個別に暗号化できます。private keyはpasswordで保護され、passwordはアプリ終了までmemoryにだけ保持されます。passwordを失うと復号できないため、安全な場所へ保管してください。

暗号化はバックアップの代替ではありません。必要な `.encrypted` ファイル自体は別途バックアップしてください。

# 暗号化の仕組みとpublicメタデータ

内部的にはRSA-OAEP（2048bit、SHA-256）の鍵ペアを使い、本文はAES-256-GCMで暗号化します。private keyはpassword由来のkey（PBKDF2、10万回反復）で保護されます。`.encrypted`ファイルのYAML frontmatterには`encrypted: true`と暗号化された`key`・`salt`のほか、任意で`description`と`publicMetadata`を設定でき、この2つはunlockしなくても平文のまま読めます。ファイルを識別するためのラベル用途に使い、機密内容そのものは書かないでください。

判定は本文が`---\nencrypted: true`で始まるかどうかで行われるため、偶然この形になっている通常ファイルは誤って暗号化ファイル扱いされる可能性があります。

# 関連機能

[AI Chat](/features/ai-chat.md)・[Workflow](/features/workflows.md)（履歴暗号化は同じ鍵の仕組みを使います）、[Discord bot](/features/discord-bot.md)（tokenの保管先として推奨）。

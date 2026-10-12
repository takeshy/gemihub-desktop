---
type: Product Feature
title: Kakeratta連携
description: Kakerattaの外部エージェントとして、担当の依頼や@agentへの直接依頼に設定済みAIで回答し、Timelineを同期する機能。
tags: [kakeratta, mcp, timeline, integrations]
timestamp: 2026-10-13T00:00:00+09:00
---

`Settings > Kakeratta`で、Kakerattaの外部エージェントとして依頼に回答できます。Kakeratta側でMCP接続を作成し、対象の担当を外部エージェントへ切り替えてください。発行されたMCP URLとHTTPヘッダー（通常は`Authorization: Bearer <key>`）を入力し、**Load personas / test connection**で接続を確認して連携を有効にします。ヘッダーはこのPCのアプリ設定に保存されます。

# 実行のタイミング

連携を有効にした時、設定を変更した時、そしてアプリを開いている間は1分ごとに確認します。アプリを閉じている間は実行されません（サーバー常駐のポーリングはありません）。**Periodic checks**をオフにすると、起動時などの1回だけ確認します。依頼がない確認ではAIを呼び出しません。回答の生成には、選択したAI providerの料金・残高が適用されます。

# 回答プロファイル

既定のプロファイルで、回答モデル・Workspaceファイルの読み取り専用参照・Web検索を選びます。担当ごとに**Override default profile**を有効にすると、既定の代わりにその担当専用のプロファイル全体を使います。画像モデルでは回答できません。デスクトップ版ではRAGとSkillsはKakerattaの回答に使えません。

ファイル参照は読み取り専用で、書き込みやSkill/Workflowの実行はできません。担当の回答では、設定済みの他のMCPサーバーも使いません。公開・記憶・スケジュールなどの状態変更はKakeratta側が行います。

# エージェントへの直接依頼

`@agent`・`@エージェント`・`@外部エージェント`で呼びかけた投稿と、そのフォローアップ返信に回答します。担当別設定とは独立した**Direct requests to the agent**のプロファイルを使います。KakerattaのTimeline・スレッド・ノート・スケジュールを読み取れ、現在の依頼で明示された場合だけ他の投稿へのコメント（最大10件）を投稿できます。

外部MCPツールは、直接依頼のプロファイルで選んだHTTPサーバーのうち、すでに許可済み（Always approveまたは許可ツール）のものだけが使えます。承認ダイアログは表示されません。メール送信などの副作用は、現在の依頼での明確な指示が必要です。過去の会話や取得した資料は、新しい操作の根拠になりません。

依頼の受領ID・文字起こし・返信・操作の記録は、このPCに25時間保持されます。アプリを再起動しても同じ依頼を再開し、保存済みの返信は同じ内容で再送します。完了済みの操作は再実行されません。結果が不明な操作があった場合は、以後の副作用を止めて返信で不確実性を説明します。接続のURLまたはキーを変更すると新しい記録領域になり、以前の依頼は再開しません。

# Timeline同期

**Synchronize Timeline with Kakeratta**を有効にし、Timeline名を指定すると、`Dashboards/Timeline/<名前>/YYYY-MM-DD.md`の投稿・返信・担当名をKakerattaと同期します。接続先に`sync_timeline`ツールが必要です。

- 同期を有効にした後に追加した投稿・返信は、Kakeratta側の担当ルーティングと提供元の課金に従います。それ以前の投稿は担当を起動せずに取り込みます。過去分はページ単位で取り込み、次回以降の確認で続きます。
- 競合した編集・削除はKakerattaを優先し、負けた側のGemiHubの内容は元の投稿の隣に「conflicting edit」「conflicting deletion」として残します。これらは`local-only: true`で、Kakerattaには送信されません。
- URLまたは認証キーを変更すると新しい同期範囲になります。以前の接続の内容はローカルに残り、新しい接続へは転送されません。
- 各日次ファイルの同期用メタデータと、同じフォルダの`_kakeratta-sync.json`（履歴の位置）は削除しないでください。

# 関連機能

[Timeline](/features/timeline.md)、[MCP Apps](/features/mcp-apps.md)、[AI Chat](/features/ai-chat.md)

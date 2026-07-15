---
type: Product Feature
title: Timeline
description: 短い投稿をMarkdownへ時系列保存し、Dashboardで閲覧・追記する個人用マイクロブログ機能。
tags: [timeline, markdown, journal, dashboard]
timestamp: 2026-07-15T00:00:00+09:00
---

Timeline widgetは、短い記録を時系列で残す個人用Markdownマイクロブログです。Dashboardに追加し、Timeline名、表示する最新件数、composer modeなどを設定します。データはProject内の通常のMarkdown資産として扱えます。

Timelineは日々のログや進捗メモのように「投稿時刻順で記録を積む」用途に向きます。特定ドキュメントの引用位置と紐づけたい場合は、別機能の[引用付きメモ](/features/document-memos.md)を使います。複数の文書メモを横断して確認する場合はMemo List widgetを使います。

# 保存の仕組みとタグ

投稿は`Dashboards/Timeline/<Timeline名>/`配下にMarkdownとして保存され、[引用付きメモ](/features/document-memos.md)と同じ投稿ファイル形式を共有しています。本文中に書いた`#タグ`は自動的に抽出され、絞り込み用のタグ一覧に使われます（frontmatterのtagsではなく本文中の記法です）。長い投稿は行数・文字数のしきい値を超えると折りたたまれ、「もっと見る」で展開します。

# AIによる文章の見直し

投稿の作成時・既存投稿の編集時に、AIへ文章の改善を依頼できます（既定の指示は「意味を保ったまま明確さを改善する」）。誤字調整や言い回しの整理をその場で依頼したいときに使えます。

# rename時の注意

Timeline widgetの名前を変更すると、参照するfolderが変わるため、既存の投稿は自動的には表示されなくなります（ファイル自体は元のfolderに残ります）。過去の投稿を引き継ぎたい場合は、旧folder名を使い続けるか、投稿ファイルを新folderへ移してください。

# 関連機能

[Dashboard](/features/dashboards.md)、[引用付きメモ](/features/document-memos.md)、[AI Chat](/features/ai-chat.md)

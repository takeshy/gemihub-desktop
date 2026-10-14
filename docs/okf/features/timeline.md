---
type: Product Feature
title: Timeline
description: 短い投稿をMarkdownへ時系列保存し、Dashboardで閲覧・追記する個人用マイクロブログ機能。
tags: [timeline, markdown, journal, dashboard]
timestamp: 2026-07-15T00:00:00+09:00
---

Timeline
widgetは、短い記録を時系列で残す個人用Markdownマイクロブログです。Dashboardに追加し、Timeline名、表示する最新件数、composer
modeなどを設定します。データはWorkspace内の通常のMarkdown資産として扱えます。

Timelineは日々のログや進捗メモのように「投稿時刻順で記録を積む」用途に向きます。特定ドキュメントの引用位置と紐づけたい場合は、別機能の[引用付きメモ](/features/document-memos.md)を使います。複数の文書メモを横断して確認する場合はMemo
List widgetを使います。

# Calendar・Kanbanとの同期

TimelineはCalendarとKanbanの記録先でもあります。Calendarの予定とKanbanのステータス変更履歴は通常の投稿と同じ
`Dashboards/Timeline/<name>/YYYY-MM-DD.md` に保存されます。

トップバーのランチャーから、最大化中のfile widgetより前面に標準の
`Timeline`、その月表示Calendar、Workspaceの `Tasks`
を使うKanban、メモ一覧を開けます。Calendarで日付を選ぶとTimeline投稿と予定をまとめて確認でき、予定の追加や別の日付への移動も行えます。DashboardへTimeline・Calendar・Kanban
widgetを配置し、widget
settingsで別の参照先を指定することもできます。ファイルの作成日・更新日による一覧は、Base
widgetで `file.ctime` または `file.mtime`
に日付フィルターを設定して作成できます。

ChatまたはDiscord
Botで明示的に「メモして」「記録して」などと頼むと、`append_timeline` application
toolが回答または要点を標準Timelineへ直接追記します。一般のfile
toolを無効にしていても、この明示的なTimeline保存は利用できます。

「今日なにをやった？」「この日に何があった？」のように活動履歴を尋ねると、`read_timeline`
application
toolが回答前に該当日の標準Timelineを読みます。日付を省略した場合は、端末のlocal
dateを今日として扱います。

# 保存の仕組みとタグ

投稿は`Dashboards/Timeline/<Timeline名>/`配下にMarkdownとして保存され、[引用付きメモ](/features/document-memos.md)と同じ投稿ファイル形式を共有しています。本文中に書いた`#タグ`は自動的に抽出され、絞り込み用のタグ一覧に使われます（frontmatterのtagsではなく本文中の記法です）。長い投稿は行数・文字数のしきい値を超えると折りたたまれ、「もっと見る」で展開します。

# 返信とスレッド

投稿には返信できます。返信への返信も可能で、`root-id`・`reply-to`・`author-name`などのメタデータとして同じMarkdownファイルに保存されます。会話は日付ごとのファイルをまたいでまとまり、返信数を展開するとスレッドを表示します。検索・日付・タグ・ピン留めの絞り込みは、一致した投稿を含む会話全体を表示します。編集とピン留めでは作者・スレッド・同期用のメタデータが保持されます。Kakerattaから取り込んだ投稿は編集・削除できません。変更はKakeratta側で行ってください。

# @aiによる返信

投稿に`@ai`を含めると、AIがそのスレッド全体を文脈として返信を投稿します。`教えて@ai`のように日本語へ続けて書けますが、メールアドレスや`@aiden`のような長いハンドルには反応しません。`@ai`を含む投稿を編集して保存すると、もう一度AIへ質問します。投稿フォームの設定ボタンで、回答モデル・Workspaceファイルの読み取り専用参照・Web検索を選べます（設定はこのPCに保存されます）。AIの返信は端末内のみで、Kakerattaには同期されません。

以前の「AIによる文章の見直し」（Edit with AI）は廃止され、`@ai`を含む投稿で質問する方式に置き換わりました。

# Kakerattaとの同期

[Kakeratta連携](/features/kakeratta.md)の設定で、名前を指定したTimelineへKakerattaの投稿を取り込めます。ローカルの投稿・返信・編集・削除はKakerattaへ送信されません。

# Blueskyへの公開

設定の**Bluesky**で**Post Timeline threads to Bluesky**をオンにし、**Connect Bluesky**でアカウントを接続すると、投稿に**Bluesky**ボタンが表示されます。接続はBlueskyの認可画面で許可します。パスワードをGemiHubへ入力する必要はありません。認可を待っている間は**Cancel connection**で中止できます。接続情報はこのPCの資格情報領域に保存され、**Disconnect**で解除できます。

**Bluesky**ボタンを押すと、同じ会話の発言が並びます。公開する発言にチェックを付け、発言ごとに**テキスト**か**画像**を選んで**Publish selected posts**を押すと、そのまま公開します。画面に表示されている内容がそのまま送られます。選択していない発言や、画面を開いた後に追加された返信は公開されません。返信先は保たれ、途中の発言を選ばなかった場合は選択済みの一番近い祖先へ返信します。

- **テキスト**：本文を公開用の文章に整えます。カレンダーの印・コールアウト・`@ai`・強調などのTimeline用の記法は取り除き、`[[ノート]]`やリンクは読める文字として残します。長文は文字のまとまりやURLを壊さず、なるべく空白の位置で分割します。Workspace内のPNG・JPEG・WebP・GIF画像は、Timelineでの表示と同じ場所から探して1投稿につき4枚まで添付します（JPEGに変換し、GIFは静止画になります）。外部URLの画像やノートの埋め込みは文字として残します。
- **画像**：Timelineでの見た目（ライトテーマ）を画像にして投稿します。本文にはリンクだけを残します。長い発言は複数の画像に分け、4枚を超える分はスレッドで続けます。コード・表・コールアウト・数式を含む発言は最初から画像が選ばれています。画像にできなかった場合はテキストで投稿します。

接続の期限が切れた場合は、接続し直してから同じ選択で再試行してください。通信が中断した場合は同じ選択のまま再試行すると、公開済みの投稿を確認してから続きを送ります。

# rename時の注意

Timeline
widgetの名前を変更すると、参照するfolderが変わるため、既存の投稿は自動的には表示されなくなります（ファイル自体は元のfolderに残ります）。過去の投稿を引き継ぎたい場合は、旧folder名を使い続けるか、投稿ファイルを新folderへ移してください。

# 関連機能

[Dashboard](/features/dashboards.md)、[Kakeratta連携](/features/kakeratta.md)、[引用付きメモ](/features/document-memos.md)、[AI Chat](/features/ai-chat.md)

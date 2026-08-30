---
type: Product Feature
title: Kanban
description: Markdownファイルをカードにし、frontmatter propertyを列状態として扱うボード機能。
tags: [kanban, markdown, frontmatter, dashboard]
timestamp: 2026-07-20T00:00:00+09:00
---

Kanbanは `.kanban`
定義とMarkdownフォルダを組み合わせるボードです。各Markdownファイルがカードになり、指定したfrontmatter
property（既定は
`status`）の値で列を決めます。カードを別の列へ移動すると、元Markdownのstatus
propertyへ反映されます。

`.kanban` 定義の `timelineName`
にTimeline名を設定すると、カードを別の列へ移動した履歴が
`Dashboards/Timeline/<name>/YYYY-MM-DD.md`
に追記されます。履歴にはボード名、カードへのWiki
Link、移動前後の列が保存され、同じTimelineを参照するCalendarにも表示されます。空欄の場合は履歴を記録しません。

# 設定

- board title
- カードを読むfolder
- status propertyとtitle property
- 列ごとの保存値と表示label

新しいTaskはKanbanから作成でき、タイトル、status、期限、Markdownの説明、チェックリスト、添付ファイルをまとめて編集できます。カードには期限、チェックリスト進捗、添付数、完了日が表示されます。Taskが2列目以降へ進むと`started`、完了列へ進むと`completed`が自動記録され、完了列から戻すと`completed`は解除されます。

カード詳細modalではMarkdownをPreview、WYSIWYG、Rawで確認・編集でき、Preview内のチェックリストは直接更新できます。添付したMarkdown、text、画像、PDF、EPUB、HTMLは同じmodalでpreviewし、それ以外の形式はdownloadできます。modalはdragで移動・resizeでき、**Open in widget**
で通常のFile widgetへ移れます。DashboardにKanban
widgetを置くか、Kanbanファイルを直接開いて利用します。

AI providerまたはCLIを設定済みなら、**Create with AI**へ自然文を入力してTask候補をJSONで生成し、内容を確認・修正してから複数Taskを一括作成できます。相対日付は現在日を基準に解決されます。

トップバーのランチャーから開く標準Kanbanは、現在のWorkspace内の`Tasks`フォルダだけを対象にし、既定列`todo`/`doing`/`done`と標準`Timeline`へのstatus履歴を使います。外部FilesのDirectoryBaseは走査しません。

元データは通常のMarkdownとYAML
frontmatterなので、外部エディタやGemiHubでも編集できます。列の移動はファイル書き換えを伴うため、必要に応じて[ファイル履歴](/features/file-history-trash.md)から復元できます。

# カード作成とならび順

新規カード作成時はタイトルからファイル名を自動生成します。ファイル名に使えない記号は`-`へ置換され、同名になる場合は末尾に連番が付きます。カード表示面には最大3つまでfrontmatter
propertyを追加表示でき、`tags`のようなlist
propertyがあれば絞り込み用のタグフィルタが自動的に現れます。列内の並び順はwidget設定側に保持され、Markdownファイル自体には書き込まれません。

# カードが消えたように見えるとき

列の`value`設定を後から変更・削除すると、その値をstatusに持つカードはどの列にも表示されなくなります（ファイルは削除されず存在し続けます）。カードが急に見えなくなった場合は、まず列設定の変更履歴を疑ってください。

# 関連機能

[Dashboard](/features/dashboards.md)、[Base](/features/bases.md)、[履歴・複製・Trash](/features/file-history-trash.md)

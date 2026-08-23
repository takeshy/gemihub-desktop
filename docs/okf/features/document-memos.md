---
type: Product Feature
title: 引用付きメモ
description: 文書の選択範囲と位置情報をMarkdownメモに保存し、引用元とTimelineを相互に移動する機能。
tags: [memo, timeline, annotation, quotes]
timestamp: 2026-07-20T00:00:00+09:00
---

引用付きメモは、読んでいる文書の選択箇所に紐づくノートです。メモは1ドキュメントにつき1つのMarkdownファイルとして、Workspace内の `Memos/` へ自動保存されます。保存先を個別に設定する必要はありません。

# 作成と利用

1. ローカルファイルのwidgetでMemo timelineを開く。
2. Markdown Preview、PDF、EPUB、HTML、テキストの文字列を選択する。
3. 右クリックして「メモに追加」を選び、本文を書いて投稿する。
4. 文書中のハイライトをクリックするとメモへ、メモ中の引用をクリックすると文書の位置へジャンプする。

メモは編集、削除、pin/unpin、コピー、`[[wiki link]]` に対応します。EPUBは文字サイズや本文幅が変わっても引用文字列から位置を再検出します。トップバーのMemo listでは、メモのあるファイルを検索し、件数と最新メモを確認して元文書を開けます。Memo listは最大化中のfile widgetより前面に表示されるため、widgetを元のサイズへ戻さずに利用できます。元文書をすでに開いているfile widgetがあればそのwidgetを最大化し、なければ既存のfile widgetへ読み込みます。file widgetが1つもない場合だけ新しく作成します。

# 保存フォーマット

`Memos/` は通常のノート置き場ではなく、文書ごとのMemo timeline sidecar専用folderです。AIやfile toolで要約Markdownを作る場合は `Memos/` へ直接作成せず、通常のWorkspace folderへ保存してください。Memoは原則としてfile widgetのMemo timelineから作成します。

Memoファイルは次の形式です。

```markdown
---
source: Introduction to Agents.pdf
---

2026-08-24T01:23:45.678Z
id: 20260824-102345-678
anchor: page=3
quote-prefix: 引用直前の文脈
quote-suffix: 引用直後の文脈

> 選択した引用文

メモ本文

---

2026-08-24T02:00:00.000Z
id: 20260824-110000-000

アンカーなしのメモ本文
```

frontmatterの `source` は元文書を開くための機械可読なpathです。**必ずプレーンなpathを書き、引用符、`[[wiki link]]`、alias、見出しリンクを使わないでください。** たとえば `source: "[[Introduction to Agents.pdf]]"` は不正です。Wiki Linkはメモ本文内では使用できます。

各投稿はUTCのISO 8601日時から始まり、次の行に一意な `id` を持ちます。選択範囲に紐づく投稿だけ `anchor` と任意の `quote-prefix`・`quote-suffix`、続いてblockquote形式の引用を持ちます。`pinned: true` はpinされた投稿だけに付きます。複数の投稿は前後に空行を伴う `---` で区切り、古いものから新しいものの順で追記します。既存Memoを更新するときはfrontmatter、投稿ID、未知のmetadataを壊さないでください。

AI機能が有効な場合、Memo timeline上部のAI buttonからChatを開けます。Chat入力にはメモファイルと元文書のpathが下書きとして入りますが、内容を自動送信はしません。質問を追記して送信すると、AIはWorkspace file toolsを使ってメモ全体と出典を確認できます。送信前にpathと質問内容を確認してください。

Settingsの「メモ同期先Timeline」にTimeline名を設定すると、新規メモの投稿時に出典へのWiki Link、引用、メモ本文を `Dashboards/Timeline/<name>/YYYY-MM-DD.md` にも追記します。空欄の場合は同期しません。Timeline側は投稿時点の履歴として扱うため、後から行ったメモの編集・削除は反映されません。同期先への書き込みに失敗しても、保存済みの元メモを再投稿して重複させないため、元メモの投稿は成功として扱います。

画像からの範囲選択メモ、および未保存ファイルへのメモは利用できません。

# メモファイル名の仕組みと注意

メモファイル名は元ドキュメントのpathから自動生成され、ユーザーやAIが自由に名付けるものではありません。`_`、path separator、Windows driveの `:` は衝突しない形にencodeされ、長すぎる場合は短縮してhashが付きます。手作業で推測せず、アプリが生成した名前を使用してください。**そのため元ドキュメントを移動・rename すると、既存メモとの対応が切れ、新しい別名のメモファイルが作られてしまいます。** メモを維持したいドキュメントは移動・renameを避けるか、メモの内容を先に確認・退避してください。

引用のハイライトは選択範囲を再現する仕組みのため、表示幅の変更や本文編集などでレンダリングが変わると、引用位置の再検出がずれることがあります（EPUBに限らず、幅を変えるビューア全般で起こり得ます）。

# 関連機能

[Timeline](/features/timeline.md)（同じ投稿保存の仕組みを共有）、[ドキュメントビューア](/features/document-viewers.md)。

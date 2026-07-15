---
type: Product Feature
title: Markdown編集
description: MarkdownをPreview、WYSIWYG、Rawの3モードで閲覧・編集し、拡張Markdown記法を表示する機能。
tags: [markdown, wysiwyg, preview, editing]
timestamp: 2026-07-15T00:00:00+09:00
---

MarkdownのFile widgetでは、用途に応じて3つのモードを切り替えます。**Preview**はレンダリング表示、**WYSIWYG**は見た目に近い直接編集、**Raw**はMarkdownソースの編集です。大きな編集には外部エディタを開き、完了後にReloadできます。

# 対応する主な記法

CommonMarkとGFMに加え、table、task list、syntax highlight、YAML frontmatter、`[[wiki link]]`、embed、callout、tag、コメント、ハイライト、数式、脚注、Mermaid diagramを扱えます。wiki linkから関連ファイルを新しいwidgetで開けます。

# 保存

明示的なSaveまたは `Ctrl/Cmd + S` でローカルファイルへ反映します。保存前後の状態は[履歴](/features/file-history-trash.md)から確認・復元できます。AIに編集を依頼する場合は[Chatのコンテキストとファイル操作](/features/chat-context-file-tools.md)を参照してください。

# 拡張記法の具体例

* Callout: `> [!note]`、`[!tip]`（hint/important）、`[!warning]`（caution/attention）、`[!danger]`（error）など。`[!type]-`で折りたたみ、`[!type]+`で展開済み、`> >`で入れ子にできます。
* Embed: `![[Note]]`、`![[Note#見出し]]`、`![[Note#^block-id]]`（ノート）、`![[image.png|300]]`（幅指定）、`![[image.png|640x480]]`（幅x高さ）、`![[document.pdf#page=3]]`（PDFページ指定）。
* Block ID: 段落末に`^block-id`を付け、`[[Note#^block-id]]`で参照します。
* コメント: `%%隠したい文%%` またはブロック全体を`%% ... %%`で囲みます。
* ハイライトは`==text==`、数式はinline `$...$`とblock `$$ ... $$`、脚注は`text[^1]`+`[^1]: 内容`、またはinline `^[この場で書く内容]`。
* タグは`#tag`や`#nested/tag`。使える文字は各言語の文字・数字（先頭不可）・`_`・`-`・`/`です。
* frontmatterのproperty型はText、Number、Checkbox、Date、Date & Time、List、Linksに対応し、`tags`・`aliases`・`cssclasses`は特別に扱われます。

# 互換性の注意

これらの記法は`remark-gfm`とGemiHub Desktop独自の拡張実装（remark-mathのような既存プラグインの単純な組み合わせではない）で描画しています。そのため、表のセル内の数式など複数記法が重なるような特殊なケースでは、他のMarkdownアプリと見え方が完全には一致しないことがあります。表示が想定と異なる場合は、記法を分けて書き直すと解決することがあります。

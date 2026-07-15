---
type: Product Feature
title: ドキュメントビューア
description: Markdown、テキスト、HTML、PDF、EPUB、画像を同じワークスペースのwidgetで表示する機能。
tags: [documents, pdf, epub, html, images]
timestamp: 2026-07-15T00:00:00+09:00
---

File widgetは拡張子に応じてMarkdown、プレーンテキスト、HTML、PDF、EPUB、画像を表示します。異なる形式を行方向または列方向に並べ、比較しながら読むことができます。

# 形式別の操作

* PDF: ページ移動とテキスト選択に対応します。
* EPUB: 戻る・進む、文字サイズ、本文幅の調整に対応します。
* HTML・テキスト: 内容を表示し、テキスト選択からメモを作成できます。
* 画像: 画像内容をwidget内に表示します。
* Markdown: Preview、WYSIWYG、Rawを切り替えられます。詳細は[Markdown編集](/features/markdown-editing.md)。

Markdown、PDF、EPUB、HTML、テキストでは選択範囲から[引用付きメモ](/features/document-memos.md)を作れます。PDFやEPUBそのものを編集する機能ではなく、閲覧と注釈が中心です。

# 形式の選び方

編集を続ける原稿にはMarkdownまたはtext、配布時の見た目を固定した資料にはPDF、章立てされた電子書籍にはEPUBが向きます。HTML viewerは保存済みHTMLの確認用です。外部ページを常時表示したい場合はDashboardのWeb Embedを使います。

# 表示とメモの注意

PDFの文字選択可否は、PDF内にtext layerがあるかに依存します。スキャン画像だけのPDFでは文字列を選択できません。EPUBの引用位置は表示幅変更後に文字列から再検出しますが、元ファイルの本文が変更されると一致しない場合があります。画像viewerは表示には対応しますが、画像領域を引用メモとして選択する機能はありません。

表示が崩れる場合はReloadを試し、それでも解消しなければ同じファイルを一般的なviewerで開いてファイル自体が正常か確認してください。

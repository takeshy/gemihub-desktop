---
type: Product Feature
title: ファイル管理
description: ローカルファイルの選択、検索、ドラッグ＆ドロップ、保存、再読み込み、外部エディタ連携を提供する機能。
tags: [files, filetree, editor, export]
timestamp: 2026-07-15T00:00:00+09:00
---

ローカルファイルはwidgetとして開き、複数並べて扱えます。`+ Add Widget`、File picker、ウィンドウへのdrag & drop、OSの「プログラムから開く」、起動引数のいずれからでも開けます。File pickerでは作業ディレクトリ内のファイルと最近使ったファイルを検索できます。

# 主な操作

* `Ctrl/Cmd + P`: File pickerを開く。
* `Ctrl/Cmd + S`: 現在のローカル状態を保存する。
* `Ctrl/Cmd + E`: 現在のdocument contentをexportする。
* widget toolbarのReload: ディスク上の変更を再読込する。
* External editor: `Settings > Working directory`で実行ファイルを指定し、ローカルファイルを外部エディタで開く。
* widgetは移動、リサイズ、最大化、クローズが可能。`Ctrl/Cmd + O`で最大化、`Ctrl/Cmd + M`で戻します。

FileTreeとファイルAPIは選択したWorking directoryをルートにします。削除や過去版の復元については[履歴・複製・Trash](/features/file-history-trash.md)を参照してください。

# 基本的な流れ

1. Working directoryを設定する。
2. FileTree、file picker、drag & dropのいずれかでファイルを開く。
3. 対応するviewer/editorで作業する。
4. `Ctrl/Cmd + S` で保存する。ディスク側の変更を取り込む場合はReloadを使う。

保存していない編集がある状態でReloadすると、ローカル編集を失う可能性があります。外部エディタと同時に編集するときは、どちらを正とするか決め、保存とReloadの順番を確認してください。Exportは現在表示中のdocument contentを別ファイルとして書き出す操作で、元ファイルの保存とは異なります。

# 開けないとき

拡張子が対応形式か、ファイルがWorking directory内にあるか、OSの読み取り権限があるかを確認します。symlinkの参照先がWorking directory外なら安全のため拒否されます。外部エディタが起動しない場合は、設定した値がショートカットではなく実行ファイル本体のpathか確認してください。

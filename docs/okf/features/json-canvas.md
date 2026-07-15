---
type: Product Feature
title: JSON Canvas
description: text・file・link・groupノードと接続線を配置し、`.canvas` JSONとして保存する視覚編集機能。
tags: [canvas, diagram, json, visual]
timestamp: 2026-07-15T00:00:00+09:00
---

JSON Canvasは、アイデア、ファイル、URLを二次元に配置して関係を線で結ぶ機能です。データは `.canvas` ファイルのJSONとして保存され、GemiHubと互換性があります。

# ノードと接続

* `text`: Markdown風のテキスト
* `file`: ワークスペース内ファイルへの参照
* `link`: 外部URL
* `group`: 複数要素を視覚的にまとめる領域
* edge: ノード間の接続。接続面、矢印、色、labelを保持

ノードは追加、移動、リサイズでき、色や背景表示もファイル形式に保存されます。Canvasは自由配置の関係図に向き、一覧の絞り込みや集計には[Base](/features/bases.md)、手順の実行には[Workflow](/features/workflows.md)を使います。

# サイズと接続の仕様

新規ノードの既定サイズは280×180、最小サイズは120×72です。groupノードは背景画像を設定でき、表示方法は「cover」「ratio」「repeat」から選べます。edgeの接続面はtop/right/bottom/leftの4方向のみで、両端はそれぞれ独立して矢印の有無を設定できます。

# AIとの連携

`.canvas`を開いている間は、built-in skillのjson-canvasが自動的にactiveになり、AIがCanvasの構造を理解した上で編集を支援できます（[Agent Skills](/features/agent-skills-commands.md)参照）。

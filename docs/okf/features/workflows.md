---
type: Product Feature
title: Workflow
description: ノードと接続をYAMLに定義し、ファイル操作、HTTP、条件分岐、MCP、scriptなどを順番に実行する機能。
tags: [workflow, automation, yaml, nodes]
timestamp: 2026-07-15T00:00:00+09:00
---

Workflowは `workflows/<name>.workflow.yaml` に保存される単独のYAMLファイルです。Workflow panelで作成・編集・実行でき、実行中の進捗、ノードごとのinput/output、経過時間、変数、エラーをログで確認できます。DashboardのWorkflow widgetから実行し、指定したoutput variableを表示することもできます。

# 主なノード

変数設定、`if`/`while`による条件分岐・繰り返し、`command`、`http`、`json`、noteの読書き・検索・一覧・削除、folder list、dialog、ユーザー入力（prompt-value/prompt-file/prompt-selection）、file explorer/save、別Workflowの呼び出し、RAG sync、MCP、sleep、script、shellを組み合わせられます。

# scriptとshellの実行環境

`script` nodeは隔離されたWeb Worker内でJavaScriptを実行します。`fetch`、`WebSocket`、`importScripts`は無効化され、`window`/`document`/`localStorage`などhost側の値にはアクセスできません。渡した変数は読み取り専用（freeze）で、既定timeoutは10秒です。外部APIを呼びたい場合は`script`ではなく専用の`http` nodeを使ってください。`shell` nodeは実際のOSプロセスを起動し、既定timeoutは60秒、既定では非ゼロの終了コードでWorkflowが失敗します（`throwOnError`で変更可能）。

# 別Workflowの呼び出しとApp表示

`workflow` nodeは変数をJSON形式・`key=value`形式のいずれかでやり取りするか、指定がなければ呼び出し先の出力変数すべてを（任意のprefix付きで）親へコピーします。呼び出し先がさらに別のWorkflowを呼ぶような多段構成では、明確な再帰防止の仕組みはないため、意図せず自分自身を呼び返すような構成は避け、事前に動作を確認してください。`mcp` nodeがApp UIを返すtoolを呼んだ場合、Workflow実行中にそのApp UIをその場に表示できます。

# AI支援

AI Workflow Builderで自然言語から下書きを作り、Reviewで差分を確認できます。WorkflowをAgent Skillとして公開し、ChatやDiscordから呼び出すこともできます。

shell、network、ファイル変更を含むWorkflowは内容と入力値を確認してから実行してください。ログはWorkspaceへ保存され、設定により暗号化できます。

# 関連機能

[Workflow自動実行](/features/workflow-automation.md)、[MCP](/features/mcp-apps.md)、[Agent SkillsとSlash commands](/features/agent-skills-commands.md)、[Local RAG](/features/local-rag.md)（`rag-sync` node）。

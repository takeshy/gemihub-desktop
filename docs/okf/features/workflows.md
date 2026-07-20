---
type: Product Feature
title: Workflow
description: ノードと接続をYAMLに定義し、ファイル操作、HTTP、条件分岐、MCP、scriptなどを順番に実行する機能。
tags: [workflow, automation, yaml, nodes]
timestamp: 2026-07-20T00:00:00+09:00
---

Workflowは `workflows/<name>.workflow.yaml` に保存される単独のYAMLファイルです。Workflow panelで作成・編集・実行でき、実行中の進捗、ノードごとのinput/output、thinking、token usage、経過時間、変数、エラーをログで確認できます。進捗modalを閉じても実行は継続し、停止する場合は **Stop** を選びます。DashboardのWorkflow widgetから実行し、指定したoutput variableを表示することもできます。

# 表示と編集

Workflowファイルを通常のFile widgetで開くと、既定ではnodeと接続をMermaid diagramとして表示する **Visual** previewになります。**YAML** へ切り替えるとsourceを直接編集でき、parseに失敗した場合もYAMLへ切り替えて修正できます。

Workflow panelではnodeを一覧表示し、追加、property編集、削除、dragによる順序変更ができます。`if`/`while`の分岐先と通常nodeの次nodeもeditorで指定できます。`.workflow.yaml` はDesktop node名で保存し、`workflows`内の通常の `.yaml` / `.yml` はGemiHub Web dialectとして、`note`/`note-read`などを対応する`drive-file`/`drive-read`形式へ変換して保持します。

# 主なノード

変数設定、`if`/`while`による条件分岐・繰り返し、`command`、`http`、`json`、noteの読書き・検索・一覧・削除、folder list、dialog、ユーザー入力（prompt-value/prompt-file/prompt-selection）、file explorer/save、別Workflowの呼び出し、RAG sync、MCP、sleep、script、shellを組み合わせられます。

# scriptとshellの実行環境

`script` nodeは隔離されたWeb Worker内でJavaScriptを実行します。`fetch`、`WebSocket`、`importScripts`は無効化され、`window`/`document`/`localStorage`などhost側の値にはアクセスできません。渡した変数は読み取り専用（freeze）で、既定timeoutは10秒です。外部APIを呼びたい場合は`script`ではなく専用の`http` nodeを使ってください。`shell` nodeは実際のOSプロセスを起動し、既定timeoutは60秒、既定では非ゼロの終了コードでWorkflowが失敗します（`throwOnError`で変更可能）。

# 別Workflowの呼び出しとApp表示

`workflow` nodeは変数をJSON形式・`key=value`形式のいずれかでやり取りするか、指定がなければ呼び出し先の出力変数すべてを（任意のprefix付きで）親へコピーします。呼び出し先がさらに別のWorkflowを呼ぶような多段構成では、明確な再帰防止の仕組みはないため、意図せず自分自身を呼び返すような構成は避け、事前に動作を確認してください。`mcp` nodeがApp UIを返すtoolを呼んだ場合、Workflow実行中にそのApp UIをその場に表示できます。

# AI支援と外部LLM

AI Workflow Builderで自然言語から下書きを作れます。新規作成ではplanを確認してから生成し、生成後はlocal validationとAI reviewの結果を確認して適用します。Workspaceのtext fileはpromptへ埋め込み、画像やPDFなどのbinary fileはattachmentとして渡せます。既存Workflowの変更時は、過去のrunと参照するstepを選び、そのinput/output/errorを改善材料にできます。

アプリに設定していない外部LLMを使う場合は **Use external LLM** を選びます。Builderが完全な仕様、依頼、承認済みplan、参照text、選択した実行履歴を含むpromptを作るので、外部LLMへコピーし、返答をBuilderへ貼り付けます。貼り付けたWorkflowはYAML、node、connectionをlocal validationしますが、AI reviewは行いません。binary fileはprompt本文に含まれないため、必要なら外部LLM側へ別途添付してください。

WorkflowをAgent Skillとして公開し、ChatやDiscordから呼び出すこともできます。

shell、network、ファイル変更を含むWorkflowは内容と入力値を確認してから実行してください。ログはWorkspaceへ保存され、設定により暗号化できます。

# 実行履歴

Historyではrunごとのstatus、変数、各stepのinput/output/usage、MCP Appを確認できます。stepにvariables snapshotがある場合は **Retry** でそのstepから再実行できます。再実行は現在保存されているWorkflow定義と、履歴に保存されたその時点の変数を使います。履歴全体はJSONとしてexportでき、run単位の削除またはWorkflow単位のclearも可能です。

# 関連機能

[Workflow自動実行](/features/workflow-automation.md)、[MCP](/features/mcp-apps.md)、[Agent SkillsとSlash commands](/features/agent-skills-commands.md)、[Local RAG](/features/local-rag.md)（`rag-sync` node）。

---
type: Product Feature
title: Dashboard
description: File、Base、Kanban、Timeline、Workflowなどのwidgetを配置し、再利用可能な画面を作る機能。
tags: [dashboard, widgets, layout, workspace]
timestamp: 2026-07-20T00:00:00+09:00
---

Dashboardは複数のwidgetを自由に配置するワークスペースです。新規DashboardはWorkspace内の
`Dashboards/*.dashboard`
に可搬なYAMLとして保存され、再起動後もレイアウトを復元します。既存の
`.dashboard`
はWorkspace内のどのfolderにあっても一覧から検出します。widgetは追加、移動、リサイズ、設定、最大化、削除ができます。

# 標準widget

- File、Base、Kanban、Timeline、Workflow
- Web Embed、Memo List、Secret Manager

Web
Embedは外部のHTTPSページを埋め込みますが、対象サイトがiframe表示を禁止している場合は利用できません。Pluginは追加のwidget
typeを登録できます。

# 画像とBase cards

File
widgetで画像を開くと、25%から400%まで25%刻みで拡大・縮小できます。拡大した画像はpointerでdragして表示範囲を移動できます。画像の外部表示操作は、設定したtext
editorではなくOS既定の画像viewerを開きます。

Baseのcards viewでは `Card image` にfrontmatter propertyまたはformula
fieldを指定し、カード上部へcover
imageを表示できます。Workspace内の画像path、image/link/file/url/string値、data
URL、HTTP(S) URLを解決します。`Image fit` はCoverまたはContain、`Image ratio` と
`Card size` もBase config editorで選べます。table/list viewにはcard
image設定は適用されません。

# 互換性

DashboardはGemiHubと共通形式です。未知のwidget
typeや未知の設定値を読み込んでも削除せず保持するため、別環境でのみ使える設定を壊さず持ち運べます。DashboardのUndo/Redoと履歴表示も利用できます。

# Web Embedが失敗するとき

Web
Embedを追加すると、対象URLへのHTTPアクセスを確認し、`X-Frame-Options`が`deny`/`sameorigin`だったり、`Content-Security-Policy`の`frame-ancestors`が広く許可されていない場合は埋め込みを拒否します。ただし通信自体が失敗した場合は「埋め込み可能」として扱われるため、確認時は通っても実際の表示で失敗することがあります。表示されない場合は、サイト側のframe制限だけでなく、単純な接続失敗も疑ってください。

# widgetの既定値

Timeline widgetの既定は最新20件表示・raw composer、Workflow widgetの既定はoutput
variable名`result`・table表示・最大50件、Kanban
widgetの既定列は`todo`/`doing`/`done`（status propertyは`status`、title
propertyは`title`）です。古いDashboardに残る`type: markdown`は`file`
widgetの別名として引き続き読み込まれます。

Dashboardとは別に、トップバーのランチャーからメモ一覧、標準Timeline、Calendar、Workspaceの`Tasks`
Kanbanをアプリ最前面で開けます。Secret
Managerは独立した鍵アイコンから同様に開け、DashboardのAdd
Widgetから配置することもできます。

# 関連機能

[Base](/features/bases.md)、[Kanban](/features/kanban.md)、[Timeline](/features/timeline.md)、[Workflow](/features/workflows.md)

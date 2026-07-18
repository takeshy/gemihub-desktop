---
type: Product Feature
title: WorkspaceとFilesディレクトリ
description: 単一Workspaceの資産領域と、FileTreeおよびAIファイルツールが使うFilesディレクトリを管理する機能。
tags: [workspace, project, directory, settings]
timestamp: 2026-07-18T00:00:00+09:00
---

GemiHub Desktopは、常に1つのWorkspaceを使用します。Workspaceの切り替え一覧やsession-only modeはありません。変更が必要な場合だけ `Settings > General > Workspace directory` でpathを選び直します。

Workspaceには `Dashboards`、`Memos`、`Secrets`、`skills`、`workflows`、`.llm-hub/plugins` とアプリの状態ファイルが保存されます。起動時はHome Dashboardだけを読み、Workspaceの再帰scanはFileTreeで「Workspace」タブを開いたときに行います。plugin本体と有効化設定もWorkspace単位です。

Files directoryは、通常の資料を表示するFileTreeとAI file toolsのアクセス範囲です。`Settings > General > Files directory`またはFileTreeの「Files」タブから変更できます。Workspace directoryと同じpathを選ぶことも、資料とアプリ資産を分離することもできます。

Files directory外への `..` やsymlink経由の脱出は拒否されます。Workspace資産はWorkspace directory内に限定されます。

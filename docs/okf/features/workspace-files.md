---
type: Product Feature
title: WorkspaceとFilesタブ
description: 単一Workspaceの資産領域と、関連付けで開いたファイルのフォルダを一時表示するFilesタブ。
tags: [workspace, files, directory, settings]
timestamp: 2026-07-18T00:00:00+09:00
---

GemiHub Desktopは、常に1つのWorkspaceを使用します。Workspaceの切り替え一覧やsession-only modeはありません。変更が必要な場合だけ `Settings > General > Workspace directory` でpathを選び直します。

新規インストール時の既定値は、ExplorerやFinderからファイルをコピーしやすいユーザーの `Documents/GemiHub Workspace` です。

Workspaceには `Dashboards`、`Memos`、`Secrets`、`skills`、`workflows`、`.llm-hub/plugins` とアプリの状態ファイルが保存されます。起動時はHome Dashboardだけを読み、Workspaceの再帰scanはFileTreeで「Workspace」タブを開いたときに行います。plugin本体と有効化設定もWorkspace単位です。

FilesタブはSettingsで管理する常設設定ではありません。「プログラムから開く」や拡張子の関連付けでファイルを開いた場合、そのファイルがあるフォルダを表示し、AI file toolsのアクセス範囲にもします。単独起動では最後に選択していたWorkspace/Filesタブ、Filesで開いていたフォルダ、Dashboardを復元します。必要なときはFilesタブのフォルダ名を押して別のフォルダを開けます。

Filesタブで開いたフォルダ外への `..` やsymlink経由の脱出は拒否されます。Workspace資産はWorkspace directory内に限定されます。

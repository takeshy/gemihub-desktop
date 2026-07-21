---
type: Product Feature
title: WorkspaceとFilesタブ
description: 単一Workspaceの資産領域と、関連付けで開いたファイルのフォルダを一時表示するFilesタブ。
tags: [workspace, files, directory, settings]
timestamp: 2026-07-20T00:00:00+09:00
---

GemiHub Desktopは、常に1つのWorkspaceを使用します。Workspaceの切り替え一覧やsession-only modeはありません。変更が必要な場合だけ `Settings > General > Workspace directory` でpathを選び直します。

新規インストール時の既定値は、ExplorerやFinderからファイルを移動しやすいユーザーの `Documents/GemiHub Workspace` です。

Workspaceには `Dashboards`、`Memos`、`Secrets`、`skills`、`workflows`、`.llm-hub/plugins` とアプリの状態ファイルが保存されます。起動時はHome Dashboardだけを読み、Workspaceの再帰scanはFileTreeで「Workspace」タブを開いたときに行います。plugin本体と有効化設定もWorkspace単位です。

FilesタブはSettingsで管理する常設設定ではありません。「プログラムから開く」や拡張子の関連付けでファイルを開いた場合、そのファイルがあるフォルダを表示します。単独起動では最後に選択していたWorkspace/Filesタブ、Filesで開いていたフォルダ、Dashboardを復元します。必要なときはFilesタブのフォルダ名を押して別のフォルダを開けます。

Chatのattachment pickerとAI file toolsはFilesタブではなくWorkspace全体を対象にします。Workspace外の資料をAIに読ませたい場合は、必要なファイルをWorkspaceへ移動してから添付するか、表示中の文章を選択して右クリックメニューの「AIに相談」を使ってください。

Filesタブで開いたフォルダ外への `..` やsymlink経由の脱出は拒否されます。Workspace資産はWorkspace directory内に限定されます。

# Workspaceへファイルを取り込む

ExplorerやFinder、またはアプリ内のFilesツリーからWorkspaceツリーのrootか任意のfolderへdragすると、確認後に元の場所からWorkspaceへ移動します。実行前に移動元と移動先を確認するdialogが表示されます。folderを1つ移動するときは、元の場所にWindowsのdirectory junctionまたはmacOS/Linuxのsymlinkを残すこともできます。folder内にsymlinkが含まれる場合や、移動先に同名項目がある場合は安全のため拒否されます。

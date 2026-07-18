---
type: Product Feature
title: 履歴・複製・Trash
description: 上書き前のファイル版を保持し、差分確認、過去版の復元、複製、削除ファイルの復元を行う安全機能。
tags: [history, trash, restore, safety]
timestamp: 2026-07-15T00:00:00+09:00
---

GemiHub Desktopはファイルを上書きする前に履歴を記録し、最大50世代を保持します。History画面ではcheckpointを選び、現在との差分をunifiedまたはsplit表示で確認して復元できます。開いた時点、idle、focus離脱、手動保存、復元、reloadなどが履歴理由として表示されます。

# ファイル操作

* Duplicate: 元ファイルを残したまま複製を作る。
* Trash: 即時の完全削除ではなくTrashへ移す。
* Restore Trash: Trash一覧から削除済みファイルを戻す。
* Restore history: 指定した過去版を現在のファイルへ復元する。

履歴とTrashはFiles directoryとWorkspaceのルート制約を守ります。Dashboard編集には別途session内Undo/RedoとDashboard historyがあります。機密性が必要なChat履歴やWorkflow logは[暗号化](/features/encryption-secret-manager.md)を有効にしてください。

# 履歴の保存先はファイルの所属で決まる

履歴とTrashは、そのファイルが現在の**Workspace**内にあるか、それとも**Files directory**内にあるかによって保存場所（scope）が分かれます。[WorkspaceとFilesディレクトリ](/features/workspace-projects.md)の設定次第でファイルの所属先が変わるため、後からWorkspace直下へファイルを移動した場合、その前後で履歴の保存先が変わり、片方のscopeで探しても見つからないことがあります。どちらにも属さない場所のファイルには、履歴が記録されません。

# 確認点

* 過去版が見当たらない: 対象ファイルがWorkspaceとFiles directoryのどちらの範囲にあるか、以前と変わっていないか確認する。
* 50世代を超えた古い版は自動的に削除されます。長期保存が必要な版は別途エクスポートしてください。
* バイナリ的な内容（既知のバイナリ拡張子やnull byteを含む場合）は保存されますが、差分表示ではなく保存・復元が中心の扱いになります。

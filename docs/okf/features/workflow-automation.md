---
type: Product Feature
title: Workflow自動実行
description: ファイルの作成・変更・削除・名前変更・オープンを契機に、条件に合うWorkflowを自動実行する機能。
tags: [workflow, automation, events, files]
timestamp: 2026-07-15T00:00:00+09:00
---

Workflow Automationは、作業ディレクトリで起きたファイルイベントをtriggerとしてWorkflowを実行します。対象イベントはfile created、modified、deleted、renamed、openedです。automation ruleには実行するWorkflowと対象パス条件などを設定します。

# 利用上の注意

* 保存のたびに発火するruleは、Workflow自身が同じ対象を更新すると再実行ループになる可能性があります。対象pathを狭くしてください。
* file-open triggerは、アプリで対象ファイルを開いたときに発火します。
* 自動実行でもWorkflowのsandboxや各nodeの制約は変わりません。
* 実行結果はWorkflow history/logで確認します。

手動実行やノード構成については[Workflow](/features/workflows.md)を参照してください。

# 検知のタイミング

ファイルイベントの検知はfilesystemの即時通知ではなく、約3秒ごとのポーリングによる差分検出です。変更（modify）はさらに5秒のdebounceを経てから発火するため（保存直後に連続変更があるとtimerがリセットされます）、保存してから自動実行が始まるまで数秒〜十秒弱のずれが生じます。発火後は、対象ファイルとそのWorkflow自体に約12秒のcooldownがかかり、直後の再発火を防ぎます。rename判定は、同じ内容のファイルが一つ消えて一つ現れたことを内容比較で推定して合成されます。file pattern条件では`*`、`**`、`?`、`{a,b,c}`のようなbrace展開が使えます。

# Hotkey trigger

Automation ruleとは別に、特定Workflowへ任意のキーボードショートカットを割り当てて実行するHotkey機能があります。入力欄など編集中の要素にフォーカスがある間は発火しません。実行時にはactive fileの内容や選択範囲などがWorkflowの初期変数として渡され、既定では実行中の進捗を示すモーダルが表示されます（Workflow側の設定で非表示にできます）。

# 保存場所の注意

Automation ruleとHotkeyの割り当てはWorkspaceのpathに紐づけてブラウザ側のlocalStorageへ保存されます。Workspace directoryを変更すると別のruleセットが表示されます。また、アプリやブラウザのstorageを消去すると、Workflowファイル自体は残ったままruleとHotkeyの設定だけが失われるため注意してください。

# 関連機能

[Workflow](/features/workflows.md)、[WorkspaceとFilesタブ](/features/workspace-projects.md)。

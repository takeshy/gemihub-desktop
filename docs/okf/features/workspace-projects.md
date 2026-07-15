---
type: Product Feature
title: Projectsと作業ディレクトリ
description: Projectsの資産領域と、FileTreeおよびAIファイルツールが使う作業ディレクトリを分けて管理する機能。
tags: [workspace, projects, directory, settings]
timestamp: 2026-07-15T00:00:00+09:00
---

GemiHub Desktopでは、**Project**と**Working directory**は別の概念です。ProjectにはDashboards、Secrets、Agent Skills、Workflowsなどのプロジェクト資産を保存し、Working directoryはFileTreeとAIのファイルツールが読み書きするルートになります。メモディレクトリもこの2つとは独立しています。

# 操作

* `Settings > Projects`でProjectの作成、名前・場所の編集、切り替え、一覧からの解除を行います。
* ProjectのDirectoryを空欄にすると、OS標準のアプリ設定領域内に管理ディレクトリを作ります。
* `Settings > Working directory`でFileTreeのルートを選びます。
* Projectを一覧から外しても、実ファイルは削除されません。

# 制約と安全性

作業ディレクトリ外への `..` による移動やsymlink経由の脱出は拒否されます。Project未選択時はsession-onlyの状態で利用でき、Project固有資産は選択したProjectごとに分離されます。

# 関連機能

[ファイル管理](/features/file-management.md)、[Dashboard](/features/dashboards.md)、[Agent Skills](/features/agent-skills-commands.md)

# 推奨する初期構成

個人利用では、Project directoryとWorking directoryを同じフォルダにすると管理が単純です。既存の文書フォルダを汚したくない場合は、Projectをアプリ管理領域へ置き、Working directoryだけ既存フォルダへ向けます。Projectを切り替えるとDashboard、Workflow、Skillなども切り替わりますが、Working directoryは別設定なので、意図した組み合わせか確認してください。

# よくある確認点

* FileTreeが空: Working directoryが未設定か、別のフォルダを指していないか確認する。
* DashboardやWorkflowが見つからない: 正しいProjectを選択しているか確認する。
* メモを作れない: Memo directoryはWorking directoryとは別に設定が必要。
* 外付けドライブ上のProjectが開けない: ドライブの接続、OS権限、元のパスを確認する。
* [Workflow自動実行](/features/workflow-automation.md)のruleやHotkeyが消えた・別のものになった: これらはProjectではなくWorking directoryのpathに紐づけて保存されるため、Working directoryを切り替えると別のrule設定が表示されます。

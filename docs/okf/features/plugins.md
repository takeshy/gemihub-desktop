---
type: Product Feature
title: Plugins
description: 権限を宣言した拡張機能を追加し、view、command、Dashboard widget、toolなどをGemiHub Desktopへ組み込む機能。
tags: [plugins, extensions, permissions, github]
timestamp: 2026-07-15T00:00:00+09:00
---

PluginはWorkspace内の `.llm-hub/plugins/{id}` へ手動配置するか、`Settings > Plugins`からGitHub Release assetを取得してインストールします。有効化、update、uninstall、Plugin固有設定も同じ画面で管理します。右サイドバーのPlugin viewは、インストール済みPluginの機能を使う場所です。

`files` permissionを宣言したPluginはFiles directory用APIに加えて`api.projectFiles`を利用できます。このAPI名は互換性のため残っていますが、対象は現在のWorkspaceです。`inventory/read/create/update/rename/delete`でWorkspace相対pathを扱います。`network` permissionを宣言したPluginは`api.network.request()`でDesktopのHTTPS transportを利用できます。

# 権限と更新

Pluginはmanifestで必要なpermissionを宣言します。宣言できる種類は`files`、`storage`、`network`、`llm`、`drive`、`gemini`、`calendar`、`gmail`、`sheets`です（`drive`はfile toolへのアクセスも暗黙に含みます）。管理インストールではplugin ID、version、host compatibility、file integrity、permission変更を検証し、成功した場合だけatomicに差し替えます。uninstallも管理画面から行えます。

手動配置したPluginと管理インストールしたPluginは区別され、管理処理が手動Pluginを不用意に上書きしないよう保護されます。未知のPluginはcodeとpermissionを確認してから有効化してください。networkや`gmail`/`calendar`/`sheets`など外部accountに関わるpermissionを持つPluginは、外部へdataを送ったり操作したりする可能性があります。

# 強い権限を持つ機能への注意

manifestは追加のassetを宣言でき、初回利用時に取得されてsha256で整合性を検証したうえでcacheされます。asset取得先が内部・private hostに解決される場合は取得が拒否されます。さらにmanifestは`hostPatches`としてhostアプリ自体のファイルへdiff形式のパッチを宣言できます。これは通常のview/command/widget登録より強い権限で、host自体の挙動を書き換え得るため、`hostPatches`を含むPluginは特に内容を確認してから有効化してください。

# 関連機能

[Dashboard](/features/dashboards.md)（widget登録）、[MCP](/features/mcp-apps.md)、[暗号化とSecret Manager](/features/encryption-secret-manager.md)（権限確認の考え方は共通です）。

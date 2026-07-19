---
type: Product Feature
title: Plugins
description: 権限を宣言した拡張機能を追加し、view、command、Dashboard widget、toolなどをGemiHub Desktopへ組み込む機能。
tags: [plugins, extensions, permissions, github]
timestamp: 2026-07-15T00:00:00+09:00
---

PluginはWorkspace内の `.llm-hub/plugins/{id}`
へ手動配置するか、`Settings > Plugins`からGitHub Release
assetを取得してインストールします。有効化、update、uninstall、Plugin固有設定も同じ画面で管理します。右サイドバーは1つのPluginタブとselectを共有し、選択したPluginのsidebar
viewを表示します。隣の設定ボタンは、そのPluginが登録したsettings
tabを直接開きます。

Pluginが`location: "main"`のviewを登録すると、Desktopはそのviewを暗黙のPluginWidgetとしてDashboardへ追加します。同じtypeのwidgetがすでにあればconfigと登録定義を更新して再利用し、どちらの場合もwidgetを最大化します。main
viewが`extensions`を宣言している場合、その拡張子のファイルを開く操作は汎用File
widgetを作らず、対応するPluginWidgetへ自動的にルーティングされます。旧Desktop
patchがmain viewを`extensions`付きsidebar
viewとして登録している場合も同じ契約へ自動変換します。

`api.registerWidget`はGemiHub
Webと同じ`WidgetDef`契約（`render(config, ctx)`、`ConfigEditor`、`filePathOf`、`externalUrlOf`）を使用し、Webと同じ`type`を保存します。

`files` permissionを宣言したPluginはFiles
外部Files用の`api.files`とは別に、現在のWorkspaceを扱う`api.workspaceFiles`を利用できます。`inventory/read/create/update/rename/delete`でWorkspace相対pathを扱います。`network`
permissionを宣言したPluginは`api.network.request()`でDesktopのHTTPS
transportを利用できます。

# 権限と更新

Pluginはmanifestで必要なpermissionを宣言します。宣言できる種類は`files`、`storage`、`network`、`llm`、`drive`、`gemini`、`calendar`、`gmail`、`sheets`です（`drive`はfile
toolへのアクセスも暗黙に含みます）。管理インストールではplugin ID、version、host
compatibility、file
integrity、permission変更を検証し、成功した場合だけatomicに差し替えます。uninstallも管理画面から行えます。

Desktop Pluginは有効化するとmain application
realmで実行されます。manifestのpermissionはPlugin
APIの公開範囲を表しますが、host
realm自体をsandbox化するものではありません。内容を確認できないPluginは有効化しないでください。

手動配置したPluginと管理インストールしたPluginは区別され、管理処理が手動Pluginを不用意に上書きしないよう保護されます。未知のPluginはcodeとpermissionを確認してから有効化してください。networkや`gmail`/`calendar`/`sheets`など外部accountに関わるpermissionを持つPluginは、外部へdataを送ったり操作したりする可能性があります。

Plugin管理画面では、GemiHub公式配布元のPluginを`Official`、Workspaceへ手動配置した自作・ローカル管理Pluginを`Custom / locally managed`として表示します。それ以外のGitHub配布Pluginは`Third-party · Not recommended`です。第三者Pluginはinstall自体を禁止しませんが、公式または自作Plugin以外の利用は非推奨です。この区分はPlugin自身が偽装できるmanifestの記載ではなく、install元metadataから判定します。

# 強い権限を持つ機能への注意

manifestは追加のassetを宣言でき、初回利用時に取得されてsha256で整合性を検証したうえでcacheされます。asset取得先が内部・private
hostに解決される場合は取得が拒否されます。`hostPatches`はGitHub
Releaseの`main.js`へhost別diffを適用する仕組みで、hostアプリ自体のsourceは変更しません。通常APIで吸収できない差分だけに使用し、内容を確認してから有効化してください。

# 関連機能

[Dashboard](/features/dashboards.md)（widget登録）、[MCP](/features/mcp-apps.md)、[暗号化とSecret Manager](/features/encryption-secret-manager.md)（権限確認の考え方は共通です）。

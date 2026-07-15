---
type: Product Feature
title: MCP serversとMCP Apps
description: HTTPまたはstdioのModel Context Protocol serverを接続し、toolsと対話UIをChat・Workflowで利用する機能。
tags: [mcp, tools, apps, integrations]
timestamp: 2026-07-15T00:00:00+09:00
---

MCPは外部serviceやlocal processのtoolをAIへ接続する仕組みです。`Settings > MCP servers`でserverを追加し、有効化します。remote HTTP serverとlocal stdio processに対応し、必要なserverではOAuth接続も利用できます。

# 利用場所

* Chat: 有効なserverのtoolをAIが呼び出す。
* Workflow: `mcp` nodeからserver、tool、argumentsを指定して実行する。
* MCP Apps: tool結果に含まれるapp metadataを使い、対話UIをChatまたはWorkflow内に表示する。

# 注意

MCP toolはファイル、network、外部accountなどへ変更を加える場合があります。serverの提供元、command、URL、要求permissionを確認してください。stdio serverはローカルprocessとして起動され、HTTP serverはnetwork越しに通信します。OAuth tokenはserver IDに紐づけて管理・refreshされ、Settingsからdisconnectできます。

# MCP AppsのSandbox

MCP Appのhtmlはiframe内で実行され、scriptとformの実行は許可されますが、host側と同一originになる許可（allow-same-origin）は与えられません。つまりMCP AppのコードはhostのcookieやlocalStorage、親DOMへアクセスできず、hostとのやり取りはpostMessageベースのJSON-RPC形式に限られます。MCP Appがブラウザのstorageに状態を保存しようとしても保持されないのは、この隔離設計によるものです。

# OAuth接続

MCP serverのOAuth接続は、Vertex AIの認証と同様にPKCE付きの認可コードフローとローカルloopback HTTPサーバーを使う方式です。serverが対応していれば、事前にclient登録情報を入力しなくても動的client登録で接続できます。

# 関連機能

[AI Chat](/features/ai-chat.md)、[Workflow](/features/workflows.md)（`mcp` nodeからも同じApp UIを表示可能）、[Plugins](/features/plugins.md)。

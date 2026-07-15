---
type: Product Feature
title: Agent SkillsとSlash commands
description: AIへ再利用可能な手順・参考資料・Workflowを与え、Chatから明示的に呼び出す機能。
tags: [skills, commands, ai, workflows]
timestamp: 2026-07-15T00:00:00+09:00
---

Agent Skillは `SKILL.md` を中心に、AIが特定作業を行うための説明、手順、references、関連Workflowをまとめたディレクトリです。ProjectのSkillsをSettingsで検出・有効化し、Chat sessionごとにactive skillを選べます。Markdownなど対応形式向けのbuilt-in skillsもあります。

# 管理と利用

* `Settings > Agent skills`: workspace skillsの一覧、有効化、AIによる修正。
* Slash command: Chat入力から定型prompt、Skill、Plugin commandなどを呼び出す。
* Skill Workflow: Skillに紐づくWorkflowをChat toolとして実行する。
* Workflow panelから既存WorkflowをSkillとして公開できる。

Skillは「作業のしかた」をAIへ教えるのに向きます。製品仕様や業務用語など「回答の根拠となる知識」は[OKF](/features/okf-knowledge.md)、大量文書の検索は[Local RAG](/features/local-rag.md)を使います。外部から取得したSkillは指示とWorkflow内容を確認してから有効化してください。

# built-in skillsと自動切り替え

built-in skillsはmarkdown、json-canvas、base、dashboardの4種類のみで、既定でactiveなのはmarkdownだけです。`.canvas`、`.base`、`.dashboard`のファイルを開いている間は、対応するbuilt-in skillがそのsessionの選択へ自動的に追加されます。別ファイルへ切り替えると追加分は外れ、ユーザーが選んだskillだけに戻ります。

# 名前衝突とMCP scope

Slash commandとSkillのフォルダ名が一致する場合、送信時はSkillが優先して解決されます。同名のSlash commandを作っても呼び出されないため、Skillとは異なる名前を付けてください。またSlash commandは`enabledMcpServers`を指定でき、指定した場合はそのコマンド実行中だけAIが使えるMCP serverを列挙した名前に絞れます（未指定なら通常のMCP設定に従います）。

# 関連機能

[Workflow](/features/workflows.md)（Skill Workflowの実体）、[MCP](/features/mcp-apps.md)（server scopeの指定）、[Markdown編集](/features/markdown-editing.md)（built-in markdown skillの記法一覧）。

# GemiHub Desktop v1.2.3

## What's new

- Fixed binary HTTP proxy responses so Google Drive Sync downloads Office,
  PDF, and image files through `bodyBase64` without creating empty files.
- Added a quick Timeline post button beside Launcher that opens the Timeline
  composer directly.
- Added Agent Plugins v1 support for installing portable Agent Skills and stdio
  or Streamable HTTP MCP servers from public GitHub repositories.
- Added pinned release/branch installs, update previews, enable/disable controls,
  and uninstall support for Agent Plugins.
- Hardened Agent Plugin installation with manifest, repository, commit, path,
  size, executable, and Skill metadata validation at the backend boundary.
- MCP approval and credentials are now retained during an Agent Plugin update
  only when the server connection definition is unchanged.
- Agent Plugin MCP servers are tested during installation and become available
  automatically for chat turns that activate a Skill from the same plugin.
- MCP Apps now use the standard UI initialization and tool-result notification
  handshake instead of the legacy custom notification, and enforce the
  resource and connection domains declared by MCP UI resource metadata.

GemiHub Desktop is a local-first desktop workspace that brings files, AI chat,
dashboards, workflows, memos, and plugins together in one application.

## Highlights

- **Flexible dashboards** — Arrange File, Memo List, Base, Kanban, Timeline,
  Secret Manager, Workflow, and Web widgets in multiple customizable
  dashboards.
- **Rich document workspace** — Open and work with Markdown, PDF, EPUB, HTML,
  images, text, YAML workflows, Bases, Kanban boards, and JSON Canvas files.
- **Document memos** — Save notes and quotations linked to their original file
  and location, then browse them from a shared memo timeline.
- **AI chat** — Use cloud APIs, local OpenAI-compatible providers, or supported
  CLI agents with Workspace context, RAG, Web search, and MCP integrations.
- **AI workflows** — Create and revise visual YAML workflows from natural
  language, review changes as a diff, and run interactive or automated tasks.
- **Visual editing** — Edit Markdown in Preview, WYSIWYG, or Raw mode and manage
  workflows through both a node editor and YAML.
- **Extensible plugins** — Install plugins that add commands, views, widgets,
  file handlers, and AI integrations with declared permissions.
- **Local-first security** — Workspace files remain under your control;
  encrypted files, confirmation before AI-proposed edits, Trash, and file
  history help protect important data.

## Downloads

This release provides standalone binaries for:

- Windows x64
- Windows ARM64
- Linux x64
- Linux ARM64
- macOS Apple Silicon

Deno and Go are not required at runtime. The macOS binary is currently
unsigned.

---

GemiHub Desktopは、ファイル、LLMチャット、ダッシュボード、Workflow、
メモ、プラグインを一つにまとめたローカルファーストのDesktop Workspaceです。

Markdown、PDF、EPUB、HTMLなどの閲覧・編集、文書への引用メモ、自由に配置
できるDashboard、自然言語から作成できるAI Workflow、RAG・Web検索・MCP対応
のAIチャット、権限管理されたプラグインを一つのアプリで利用できます。

Windows x64 / ARM64、Linux x64 / ARM64、macOS Apple Silicon向けの
単体実行バイナリを提供します。

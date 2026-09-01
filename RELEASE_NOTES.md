# GemiHub Desktop v1.4.9

## What's new

- Added a one-click Chat panel width toggle with an icon that changes to show
  whether the next action will widen or narrow the panel.
- Added compact manual Chat export to a configurable Workspace folder. Notes
  use `YYYYMMDD-HHmmss_Chat title.md`, omit metadata, and overwrite when the
  same chat is exported again.
- Added a configurable saved Chat history limit. It defaults to 100 for both
  new and existing users; setting it to 0 keeps histories without a limit.

# GemiHub Desktop v1.4.8

## What's new

- Kanban cards became full tasks: title, status, due date, Markdown notes, a
  checklist and attachments in one editor, with `started` and `completed`
  recorded as a task moves between columns. **Create with AI** turns a sentence
  into several proposed tasks you can review before they are created.
- Chat file tools now deliver Workspace PDFs as documents to the models that
  accept them and as extracted per-page text everywhere else, instead of
  base64 the model could not read. Other binary formats are refused with a
  message that says what to do instead.
- Workflow automation can be configured again: the workflow view has an
  Automation button for its event triggers, file pattern and hotkey, and it
  lights up once one is registered.
- Automation gained an **App started** trigger, and the `rag-sync` node now
  runs a real incremental local RAG sync, so a workflow can refresh the index
  at startup.
- Workflows run by an event report themselves in a small toast — running,
  elapsed time when they finish, and the error until it is dismissed.
- Chat clears the composer the moment a message is sent, instead of leaving
  the text in place while referenced files and RAG results are gathered.
- Chat now searches the selected RAG index on demand instead of injecting
  automatic retrieval into every turn, with up to three focused searches.
- Official OpenAI chat uses the Responses API and exposes configurable
  reasoning effort from none through max.
- Chat tool chips name the call in their tooltip — the search query, the file
  path, the shell command — including tools run through Codex.
- Local file links in chat answers open in the app instead of the browser, and
  scheme-less web links now open externally instead of doing nothing.
- Workspace: off no longer lets a model reach Workspace file tools it was never
  offered by registering a frontend tool.
- The Windows Store package registers file associations for `.md`, `.txt`,
  `.html`, `.pdf`, `.epub`, `.canvas`, `.dashboard`, `.yaml`, `.json`, and
  `.encrypted`, so those files can be opened straight from Explorer.
- The file tree scrolls while dragging, so a file can be dropped on a folder
  that is out of view, and dropping on empty tree space moves it to the
  Workspace root.
- The dragged file now follows the cursor, the selected file keeps a distinct
  background, and only the drop target lights up during a drag.
- Added plugin-provided actions to FileTree context menus and File widget
  viewers.
- Fixed plugin file actions surviving an asynchronous plugin reload or being
  removed by a stale disposer after replacement.
- Workflow AI steps now show their proposed file changes in a diff before
  writing, with a per-line Regenerate feedback path. Set `confirm: false` on a
  command node to keep applying edits unattended.
- Chat now recalls previously sent prompts with the Up and Down arrow keys,
  kept per workspace.
- Declared MCP Apps client capabilities during initialize and accepted the flat
  `ui/resourceUri` metadata key, so more servers return their app UI.
- PDF viewers now detect corrupted or truncated stored content and reload the
  file from disk instead of failing every retry.
- Protected internal application files from plugin file API access, including
  normalized and Windows-style paths.
- Improved the built-in Markdown Skill guidance for bold spans embedded in
  Japanese and other prose.
- Increased text sizes in the New file and Workspace move dialogs for improved
  readability.
- Added Codex model and reasoning-effort selectors directly to Chat, with
  minimal, low, medium, high, and xhigh options.
- Enabled Workspace file tools for Codex App Server with all, no-search, and
  off access modes from the Vault tool menu.
- Fixed restored files being overwritten by a delayed editor auto-save after
  navigating to another file and back.
- Replaced Gemini 3.6 Flash with Gemini 3.7 Flash, removed the standard Gemini
  3.5 Flash option, and retained Gemini 3.5 Flash Lite for lightweight use cases.
- Added Codex App Server model selection and read-only dynamic Workspace tools,
  including confirmation-gated file edits and active Skill tools.
- Unified in-memory checkpoints and persistent file versions in the History
  view opened from File widgets or the FileTree context menu.
- Fixed restored Markdown widgets appearing empty after restart by migrating
  legacy paths to FileRef and clearing stale external-viewer state.
- Open File widgets now refresh immediately after applying an AI-proposed file
  change instead of requiring the file to be reopened from FileTree.
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

- Corrected the Microsoft Store package display name to match the reserved
  product name.
- Upgraded the desktop application runtime and build system to Wails v3.
- Added signed-package-ready MSIX builds for Microsoft Store submission on
  Windows x64 and ARM64.

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

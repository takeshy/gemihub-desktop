# GemiHub Desktop

> **Your AI is only as good as your data.**<br> **GemiHub Desktop is the IDE for
> ideas—an open workspace where everything becomes context for AI.**

AI can generate an answer in seconds, but the knowledge behind that answer is
usually scattered across notes, PDFs, books, boards, and half-finished ideas.
GemiHub Desktop brings those materials into one local, visual workspace and
turns them into usable context for AI.

Instead of copying fragments between apps and repeatedly explaining your project
to a chatbot, you can read, connect, annotate, organize, and ask questions in
the same place. Your workspace becomes the context window.

[日本語 README](README_ja.md)

![GemiHub workspace with Markdown, PDF, and EPUB side by side](docs/images/col.png)

## Why this app exists

GemiHub Desktop brings together three ideas developed in earlier projects:

- the fast document viewing, editing, and source-linked memo experience of
  **mdwys**;
- the RAG, OKF, AI Chat, Dashboard, and Workflow features of **GemiHub**;
- the LLM CLI and local-model integrations explored in **obsidian-llm-hub**.

The goal is a compact everyday Markdown application that can use AI deeply
without making an online service mandatory. It is distributed as a single
executable with no Go or Deno runtime dependency; the current Windows amd64
build is under 20 MB.

Files remain ordinary local files. Reading, editing, memos, Dashboards, Canvas,
Base, Kanban, history, and Trash work without AI. When needed, the same
workspace can connect to OpenAI-compatible servers—including local
servers—Gemini, Vertex AI, Anthropic, Codex, Claude, or Antigravity CLI.

Codex is not limited to developing GemiHub. A configured Codex CLI can power
Chat, draft and revise Workflows, and run LLM steps inside a Workflow. MCP
servers, Agent Skills, OKF bundles, and Plugins extend the same local workspace.

## What you can do

- **Use it as your default Markdown app.** Associate `.md` files with GemiHub,
  open them quickly from Explorer or Finder, and switch between Preview,
  WYSIWYG, and Raw editing.
- **Find notes by meaning.** Build a local RAG index over Markdown, text, PDF,
  and supported media instead of relying on filenames or remembering where a
  note was written.
- **Let AI clean up the rough work.** Ask Chat to rewrite, summarize, classify,
  or reorganize notes, then review file changes before applying them.
- **Turn reading into reusable knowledge.** Add source-linked memos while
  reading Markdown, PDF, EPUB, HTML, or technical books, and return from a memo
  to the original passage.
- **Automate recurring research.** For example, a Workflow can take an English
  technical article, translate it, and create a readable infographic note.
- **Run daily work from one screen.** Use a Dashboard for tasks, a Timeline for
  quick activity notes, and File widgets for frequently used documents.
- **Bring everyday tools to the front.** The header launcher opens Memo List,
  the system Timeline, Calendar, or Kanban above maximized widgets. Secret
  Manager keeps its own key icon.
- **Turn conversations into a daily record.** Ask Chat or the Discord bot to
  “memo this” and it can save the answer or key points directly to the Workspace
  system Timeline.
- **Give AI accurate product knowledge.** Publish your own app documentation as
  an OKF bundle so Chat can answer quickly from a curated LLM wiki.
- **Connect work systems.** Use an MCP server to turn Git history into a daily
  report, or a Plugin to back up and synchronize files with services such as
  Google Drive.

AI is optional. Without an API key, cloud account, or network connection,
GemiHub remains a local document and knowledge workspace.

## Screenshots

### Ideas stay linked to their sources

Select text in Markdown, PDF, or EPUB and create an anchored memo. Highlights
navigate to memos, and memo quotes navigate back to the source.

![Memo timeline with source-linked notes](docs/images/memo_timeline.png)

### A workspace shaped around the project

Arrange documents and tools in rows or columns, then save dashboards as portable
YAML files.

![GemiHub row layout](docs/images/row.png)

### Knowledge remains discoverable

Browse every document with memos, ordered by recent activity.

![Memo list](docs/images/memo_list.png)

## Architecture

GemiHub Desktop is built with Go, Wails, Deno, Vite, React, Wysimark-lite, and
pdf.js.

The desktop shell provides local filesystem access within a user-selected
workspace. The React frontend renders documents and workspace tools, while AI
providers, local CLIs, MCP servers, skills, plugins, and YAML workflows form an
extensible intelligence layer.

### Supported formats

- Documents: Markdown, plain text, HTML, PDF, EPUB, and images
- Workspace files: Dashboard, Base, Kanban, JSON Canvas, and Workflow YAML
- Encrypted files: self-contained `.encrypted` files that retain the original
  format

### Safety model

- Workspace APIs and AI file tools are limited to the selected Workspace
  directory. Files opened from elsewhere are limited to their explicitly opened
  Files directory; traversal through `..` or symlinks is rejected in both
  scopes.
- Up to 50 versions are saved before a file is overwritten, and deleted files
  can be restored from Trash.
- AI-proposed edits and renames require confirmation.
- Plugins declare permissions such as `files`, `storage`, `network`, and `llm`.
- File Widget text auto-saves after editing pauses. Encrypted text is
  re-encrypted with the session password and auto-saved; binary previews remain
  read-only.

## Install

Download a binary from the GitHub Releases page. Deno and Go are not required at
runtime.

Available release artifacts:

- `gemihub-desktop-linux-amd64`
- `gemihub-desktop-linux-arm64`
- `gemihub-desktop-darwin-arm64`
- `gemihub-desktop-windows-amd64.exe`
- `gemihub-desktop-windows-arm64.exe`

Each release also includes `THIRD_PARTY_NOTICES.md`. The same notices are
available in the app under **Settings → General → Third-party notices**.

On Linux and macOS, make the downloaded file executable:

```bash
chmod +x gemihub-desktop-linux-amd64
```

The macOS binary is currently unsigned, so clear its quarantine attribute before
first launch:

```bash
xattr -d com.apple.quarantine gemihub-desktop-darwin-arm64
```

## Quick start

1. Launch GemiHub Desktop and choose a local workspace directory.
2. Click `+ Add Widget` or drag files into the window.
3. Arrange sources in rows or columns.
4. Enable AI in Settings and configure a provider if you want AI features.
5. Add a file with `@file` or select text and use `{selection}` to give Chat
   grounded context.

Files can also be opened through the operating system's **Open with** action or
as startup arguments:

```bash
gemihub-desktop note.md research.pdf book.epub
```

## Development

Requirements:

- Deno 2.9 or newer
- Go 1.23 or newer
- Wails platform dependencies for your OS

Install dependencies and run the web UI:

```bash
deno install --allow-scripts
deno task dev
```

Run the desktop app in development mode:

```bash
deno task desktop
```

Type-check and build:

```bash
deno task check
deno task build
deno task desktop:build
```

Developer Tools are enabled in desktop builds. Press `Ctrl+Shift+I`
(`Cmd+Option+I` on macOS) to open the WebView inspector.

## Acknowledgments

GemiHub's built-in Markdown, Base, and Canvas Agent Skills include documentation
adapted from
[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills). The
corresponding file-format support in GemiHub was independently implemented from
the publicly described formats and behavior; it does not incorporate Obsidian
source code. Canvas support follows the open
[JSON Canvas specification](https://jsoncanvas.org/).

We are grateful to Steph Ango (@kepano), the project contributors, and the
maintainers of JSON Canvas for making their work available to the community. See
[Third-Party Notices](THIRD_PARTY_NOTICES.md) for copyright and license details.

GemiHub's WYSIWYG Markdown editor uses
[takeshy/wysimark-lite](https://github.com/takeshy/wysimark-lite), a lightweight
fork of [portive/wysimark](https://github.com/portive/wysimark). We thank the
Wysimark authors and contributors for the foundation they made available under
the MIT License.

GemiHub Desktop is built with [Wails](https://wails.io/)
([wailsapp/wails](https://github.com/wailsapp/wails)). We thank Lea Anthony and
the Wails contributors for making the framework available under the MIT License.

GemiHub is an independent project and is not affiliated with or endorsed by
Obsidian.

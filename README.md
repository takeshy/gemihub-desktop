# GemiHub

> **Your AI is only as good as your data.**<br>
> **GemiHub is the IDE for ideas—an open workspace where everything becomes context for AI.**

AI can generate an answer in seconds, but the knowledge behind that answer is usually scattered across notes, PDFs, books, boards, and half-finished ideas. GemiHub brings those materials into one local, visual workspace and turns them into usable context for AI.

Instead of copying fragments between apps and repeatedly explaining your project to a chatbot, you can read, connect, annotate, organize, and ask questions in the same place. Your workspace becomes the context window.

[日本語 README](README_ja.md)

![GemiHub workspace with Markdown, PDF, and EPUB side by side](docs/images/col.png)

## The problem

AI does not know what you know.

The source material for our best ideas lives in different formats and tools: a quote in a PDF, research in an EPUB, decisions in Markdown, tasks on a Kanban board, and relationships sketched on a canvas. Chat interfaces make us manually gather that context every time, while closed knowledge platforms make our own data difficult to inspect, move, or reuse.

The result is an AI that is powerful, but under-informed.

## The solution

GemiHub treats context as a workspace, not a prompt.

- **Bring everything together.** Open Markdown, text, HTML, PDF, EPUB, and images side by side.
- **Turn reading into knowledge.** Highlight a passage, attach a memo, and jump between the idea and its source.
- **Give AI the right context.** Attach local files with `@file`, pass selected content with `{selection}`, or search the workspace with local RAG.
- **Move from thinking to doing.** Combine documents with dashboards, Kanban boards, JSON Canvas, Bases, and reusable AI workflows.
- **Keep ownership of your work.** Files remain local, portable, and readable without GemiHub or an AI subscription.

AI is optional. When it is disabled, GemiHub remains a complete document and knowledge workspace with no API key or cloud account required.

## Demo: from scattered sources to grounded output

1. Open a research paper, an EPUB, and a Markdown draft in one workspace.
2. Highlight evidence and save linked memos without losing the original source location.
3. Add the relevant files or selected passages to Chat as explicit context.
4. Ask AI to compare sources, challenge an assumption, or draft the next section.
5. Review proposed file edits before they are applied.
6. Turn the result into a reusable workflow or track the next steps on a Dashboard.

The same workspace supports the full loop: **collect → connect → understand → create → automate**.

## Why GemiHub is different

### Context is visible

You can see the documents, selections, memos, and tools contributing to the work. AI is part of the workspace rather than a separate black-box chat tab.

### Knowledge stays connected to evidence

Memos retain their quoted text and source location. You can move from a claim back to the passage that inspired it—even after an EPUB reflows.

### Local-first by design

Your workspace directory is the source of truth. GemiHub includes version history, recoverable Trash, optional file encryption, and password-protected Chat and Workflow logs.

### Open and extensible

Use OpenAI-compatible APIs, Gemini, Vertex AI, Anthropic, or local CLIs. Extend the workspace through Agent Skills, HTTP/stdio MCP, MCP Apps, declarative workflows, and permission-aware plugins.

## What is already built

- Multi-pane document workspace with row and column layouts
- Markdown Preview, WYSIWYG, and Raw editing modes
- Anchored memos for Markdown, PDF, EPUB, HTML, and text
- Dashboards with File, Base, Kanban, Timeline, Calendar, Workflow, Web Embed, Secret Manager, and Memo List widgets
- Shared Calendar, Timeline, and Kanban status history compatible with the GemiHub Obsidian workspace format
- Optional memo-to-Timeline history with source links and quoted evidence
- AI Chat with file context, selection context, local RAG, and confirmed file operations
- YAML-based workflows with automation and execution history
- JSON Canvas, portable Bases, and Markdown-backed Kanban boards
- File history, Trash, encryption, and workspace-bound file access
- Plugin, Agent Skill, MCP server, and MCP App support
- Compatible workspace formats across GemiHub web and desktop

## Screenshots

### Ideas stay linked to their sources

Select text in Markdown, PDF, or EPUB and create an anchored memo. Highlights navigate to memos, and memo quotes navigate back to the source.

![Memo timeline with source-linked notes](docs/images/memo_timeline.png)

### A workspace shaped around the project

Arrange documents and tools in rows or columns, then save dashboards as portable YAML files.

![GemiHub row layout](docs/images/row.png)

### Knowledge remains discoverable

Browse every document with memos, ordered by recent activity.

![Memo list](docs/images/memo_list.png)

## Architecture

GemiHub Desktop is built with Go, Wails, Deno, Vite, React, Wysimark-lite, and pdf.js.

The desktop shell provides local filesystem access within a user-selected workspace. The React frontend renders documents and workspace tools, while AI providers, local CLIs, MCP servers, skills, plugins, and YAML workflows form an extensible intelligence layer.

### Supported formats

- Documents: Markdown, plain text, HTML, PDF, EPUB, and images
- Workspace files: Dashboard, Base, Kanban, JSON Canvas, and Workflow YAML
- Encrypted files: self-contained `.encrypted` files that retain the original format

### Safety model

- The selected workspace directory is the root of all file operations; traversal through `..` or symlinks is rejected.
- Up to 50 versions are saved before a file is overwritten, and deleted files can be restored from Trash.
- AI-proposed edits and renames require confirmation.
- Plugins declare permissions such as `files`, `storage`, `network`, and `llm`.
- Plaintext from encrypted files is only re-encrypted when the user explicitly saves.

## Install

Download a binary from the GitHub Releases page. Deno and Go are not required at runtime.

Available release artifacts:

- `gemihub-desktop-linux-amd64`
- `gemihub-desktop-linux-arm64`
- `gemihub-desktop-darwin-arm64`
- `gemihub-desktop-windows-amd64.exe`
- `gemihub-desktop-windows-arm64.exe`

On Linux and macOS, make the downloaded file executable:

```bash
chmod +x gemihub-desktop-linux-amd64
```

The macOS binary is currently unsigned, so clear its quarantine attribute before first launch:

```bash
xattr -d com.apple.quarantine gemihub-desktop-darwin-arm64
```

## Quick start

1. Launch GemiHub Desktop and choose a local workspace directory.
2. Click `+ Add Widget` or drag files into the window.
3. Arrange sources in rows or columns.
4. Enable AI in Settings and configure a provider if you want AI features.
5. Add a file with `@file` or select text and use `{selection}` to give Chat grounded context.

Files can also be opened through the operating system's **Open with** action or as startup arguments:

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

Developer Tools are enabled in desktop builds. Press `Ctrl+Shift+I` (`Cmd+Option+I` on macOS) to open the WebView inspector.

## Vision

The future of AI is not just a better model. It is better context: personal, inspectable, connected, and owned by the person doing the work.

GemiHub is building the open workspace for that future—**an IDE for ideas where everything can become context for AI.**

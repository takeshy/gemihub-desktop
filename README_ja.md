# GemiHub

> **AI の価値は、与えるデータで決まる。**<br>
> **GemiHub はアイデアのための IDE。あらゆる情報を AI のコンテキストに変える、オープンなワークスペースです。**

AI は数秒で答えを生成できます。しかし、その答えに必要な知識は、ノート、PDF、書籍、ボード、書きかけのアイデアに散らばっています。GemiHub はそれらをローカルのビジュアルワークスペースへ集約し、AI が利用できるコンテキストへ変えます。

アプリを行き来して断片をコピーしたり、プロジェクトについて何度もチャットボットへ説明したりする必要はありません。読む、つなぐ、注釈する、整理する、AI に相談する。そのすべてを同じ場所で行えます。**ワークスペースそのものが、コンテキストウィンドウになります。**

[English README](README.md)

![Markdown、PDF、EPUBを並べたGemiHubワークスペース](docs/images/col.png)

## 課題

AI は、あなたが知っていることを知りません。

優れたアイデアの材料は、さまざまな形式やツールに分散しています。PDF の一節、EPUB で見つけた資料、Markdown に残した判断、Kanban のタスク、Canvas に描いた関係性。従来のチャットでは、使うたびにそれらを手作業で集めなければなりません。一方、閉じたナレッジプラットフォームでは、自分のデータを確認し、移動し、別の用途へ再利用することが難しくなります。

AI は高性能でも、判断材料が不足しているのです。

## 解決策

GemiHub は、コンテキストを「プロンプト」ではなく「ワークスペース」として扱います。

- **情報をひとつの場所へ。** Markdown、テキスト、HTML、PDF、EPUB、画像を並べて開けます。
- **読んだ内容を知識へ。** 文章をハイライトしてメモを付け、アイデアと出典を相互に移動できます。
- **必要な文脈を AI へ。** `@file` でローカルファイルを添付し、`{selection}` で選択範囲を渡し、Local RAG でワークスペースを検索できます。
- **考えることから実行まで。** ドキュメントを Dashboard、Kanban、JSON Canvas、Base、再利用可能な AI Workflow と組み合わせられます。
- **成果を自分の手元に。** ファイルはローカルかつ可搬な形式で保存され、GemiHub や AI の契約がなくても読み続けられます。

AI は任意です。無効にしても、API キーやクラウドアカウントを必要としないドキュメント・ナレッジワークスペースとして利用できます。

## デモ：散らばった資料から、根拠のある成果物へ

1. 論文、EPUB、Markdown の下書きをひとつのワークスペースで開きます。
2. 根拠となる文章をハイライトし、出典位置を失わずにメモを残します。
3. 関連ファイルや選択範囲を、明示的なコンテキストとして Chat に追加します。
4. AI に資料の比較、仮説への反論、次のセクションの下書きを依頼します。
5. AI が提案したファイル変更を確認してから適用します。
6. 結果を再利用可能な Workflow にするか、次のアクションを Dashboard で管理します。

**集める → つなぐ → 理解する → 作る → 自動化する**。GemiHub はこの一連のループを同じワークスペースで支えます。

## GemiHub が違う理由

### コンテキストが見える

作業に使われているドキュメント、選択範囲、メモ、ツールを自分で確認できます。AI は独立したブラックボックスのチャットではなく、ワークスペースの一部です。

### 知識と根拠が離れない

メモには引用文と出典位置が保持されます。アイデアから、それを生んだ原文へいつでも戻れます。EPUB のレイアウトが変わった場合も、引用文字列から位置を再検出します。

### Local-first

ユーザーが選んだワークスペースフォルダが唯一の情報源です。変更履歴、復元可能な Trash、ファイル暗号化、Chat・Workflow ログのパスワード保護を備えています。

### オープンで拡張可能

OpenAI 互換 API、Gemini、Vertex AI、Anthropic、ローカル CLI を利用できます。Agent Skills、HTTP/stdio MCP、MCP Apps、宣言的 Workflow、権限を明示する Plugin によって拡張できます。

## 実装済みの機能

- 行・列レイアウトに対応したマルチペインのドキュメントワークスペース
- Markdown の Preview、WYSIWYG、Raw 編集
- Markdown、PDF、EPUB、HTML、テキストに紐づく引用付きメモ
- File、Base、Kanban、Timeline、Calendar、Workflow、Web Embed、Secret Manager、Memo List を配置できる Dashboard
- GemiHub Obsidian版と共通形式で同期できるCalendar、Timeline、Kanbanステータス履歴
- 出典リンクと引用を保持する、任意のメモ→Timeline投稿履歴
- ファイルコンテキスト、選択範囲、Local RAG、確認付きファイル操作に対応した AI Chat
- 自動実行と実行履歴を備えた YAML ベースの Workflow
- JSON Canvas、可搬な Base、Markdown ベースの Kanban
- 変更履歴、Trash、暗号化、ワークスペース内に限定されたファイルアクセス
- Plugin、Agent Skill、MCP Server、MCP App
- GemiHub Web・Desktop 間で共通利用できるワークスペース形式

## スクリーンショット

### アイデアと出典をつないだままにする

Markdown、PDF、EPUB の文章を選択し、引用付きのメモを作成できます。本文のハイライトからメモへ、メモの引用から原文へ移動できます。

![出典とつながったメモタイムライン](docs/images/memo_timeline.png)

### プロジェクトに合わせてワークスペースを組み立てる

資料やツールを行・列に配置し、Dashboard を可搬な YAML ファイルとして保存できます。

![GemiHubの行レイアウト](docs/images/row.png)

### 知識を見失わない

メモのあるすべてのドキュメントを、最近の活動順に確認できます。

![メモ一覧](docs/images/memo_list.png)

## アーキテクチャ

GemiHub Desktop は Go、Wails、Deno、Vite、React、Wysimark-lite、pdf.js で構築されています。

デスクトップシェルが、ユーザーの選んだワークスペース内のローカルファイル操作を提供します。React フロントエンドがドキュメントとワークスペースツールを描画し、AI Provider、ローカル CLI、MCP Server、Skill、Plugin、YAML Workflow が拡張可能なインテリジェンス層を構成します。

### 対応形式

- ドキュメント：Markdown、テキスト、HTML、PDF、EPUB、画像
- ワークスペース：Dashboard、Base、Kanban、JSON Canvas、Workflow YAML
- 暗号化ファイル：元の形式を保持する自己完結型の `.encrypted`

### セーフティモデル

- 選択したワークスペースフォルダが、すべてのファイル操作のルートです。`..` やシンボリックリンクによるルート外へのアクセスは拒否されます。
- 上書き前のファイルを最大50世代保存し、削除したファイルは Trash から復元できます。
- AI が提案した編集やファイル名変更は、確認後にのみ適用されます。
- Plugin は `files`、`storage`、`network`、`llm` などの権限を宣言します。
- 暗号化ファイルの平文は、ユーザーが明示的に保存したときだけ再暗号化されます。

## インストール

GitHub Releases から実行ファイルをダウンロードしてください。実行時に Deno や Go は必要ありません。

配布される実行ファイル：

- `gemihub-desktop-linux-amd64`
- `gemihub-desktop-linux-arm64`
- `gemihub-desktop-darwin-arm64`
- `gemihub-desktop-windows-amd64.exe`
- `gemihub-desktop-windows-arm64.exe`

Linux と macOS では、ダウンロードしたファイルに実行権限を付けます。

```bash
chmod +x gemihub-desktop-linux-amd64
```

macOS 版は現在未署名のため、初回起動前に quarantine 属性を削除してください。

```bash
xattr -d com.apple.quarantine gemihub-desktop-darwin-arm64
```

## クイックスタート

1. GemiHub Desktop を起動し、ローカルのワークスペースフォルダを選びます。
2. `+ Add Widget` を押すか、ファイルをウィンドウへドラッグします。
3. 資料を行または列に配置します。
4. AI を使う場合は Settings で有効にし、Provider を設定します。
5. `@file` でファイルを追加するか、文章を選択して `{selection}` で Chat に根拠を渡します。

OS の「プログラムから開く」または起動引数からもファイルを開けます。

```bash
gemihub-desktop note.md research.pdf book.epub
```

## 開発

必要な環境：

- Deno 2.9 以上
- Go 1.23 以上
- 利用する OS 向けの Wails platform dependencies

依存関係をインストールし、Web UI を起動します。

```bash
deno install --allow-scripts
deno task dev
```

デスクトップアプリを開発モードで起動します。

```bash
deno task desktop
```

型チェックとビルド：

```bash
deno task check
deno task build
deno task desktop:build
```

デスクトップビルドでは Developer Tools が有効です。`Ctrl+Shift+I`（macOS では `Cmd+Option+I`）で WebView のインスペクターを開けます。

## ビジョン

AI の未来を決めるのは、モデルの性能だけではありません。必要なのは、個人が所有し、中身を確認でき、互いにつながった、質の高いコンテキストです。

GemiHub は、その未来のためのオープンワークスペースを作ります。**あらゆる情報を AI のコンテキストに変える、アイデアのための IDE です。**

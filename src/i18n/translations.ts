// UI translations, mirroring gemihub's app/i18n/translations.ts shape:
// a flat key interface with per-language tables and a t() lookup.

export type Language = "en" | "ja";
export type LanguageSetting = Language | "system";

export interface TranslationStrings {
  // Common
  "common.close": string;
  "common.cancel": string;
  "common.save": string;
  "common.browse": string;
  "common.loading": string;

  // Top bar
  "topbar.addWidget": string;
  "topbar.equalizeVertical": string;
  "topbar.equalizeHorizontal": string;
  "topbar.toggleTheme": string;
  "topbar.memoList": string;
  "topbar.settings": string;
  "appMenu.openDirectory": string;
  "appMenu.recent": string;
  "appMenu.plugins": string;

  // Settings
  "settings.title": string;
  "settings.externalEditor": string;
  "settings.memoSyncTimeline": string;
  "settings.memoSyncTimelineHint": string;
  "settings.language": string;
  "settings.languageSystem": string;

  // History
  "history.title": string;
  "history.checkpointsSuffix": string;
  "history.restore": string;
  "history.current": string;
  "history.currentState": string;
  "history.restoreTooltip": string;
  "history.empty": string;
  "history.selectCheckpoint": string;
  "history.noPrevious": string;
  "history.diff": string;
  "history.noTextChanges": string;
  "history.noDocumentDiff": string;
  "history.unified": string;
  "history.split": string;
  "history.reason.initial": string;
  "history.reason.idle": string;
  "history.reason.blur": string;
  "history.reason.manual": string;
  "history.reason.restore": string;
  "history.reason.reload": string;
  "history.changed.fileName": string;
  "history.changed.document": string;
  "history.changed.dashboard": string;
  "history.changed.none": string;
  "history.changed.initial": string;

  // App
  "app.newDocumentConfirm": string;

  // Widget header / actions
  "widget.move": string;
  "widget.resize": string;
  "widget.maximize": string;
  "widget.restoreSize": string;
  "widget.close": string;
  "widget.more": string;
  "widget.memoTimeline": string;
  "widget.externalEditor": string;
  "widget.externalEditorOpen": string;
  "widget.openLocalFirst": string;
  "widget.reload": string;
  "widget.reloadShort": string;
  "widget.new": string;
  "widget.file": string;
  "widget.save": string;
  "widget.export": string;
  "widget.history": string;
  "widget.decreaseFont": string;
  "widget.increaseFont": string;
  "widget.narrow": string;
  "widget.widen": string;
  "widget.back": string;
  "widget.forward": string;
  "wiki.openNewWidget": string;

  // File picker
  "picker.searchRecent": string;
  "picker.searchFiles": string;
  "picker.files": string;
  "picker.recent": string;
  "picker.localFiles": string;
  "picker.noFiles": string;
  "picker.noRecent": string;

  // Alerts
  "alert.openFileFailed": string;
  "alert.desktopOnly": string;
  "alert.reloadFailed": string;
  "alert.externalEditorFailed": string;
  "alert.openFromListFailed": string;

  // Memo
  "memo.dirPrompt": string;
  "memo.needsLocalFile": string;
  "memo.panelTitle": string;
  "memo.collapse": string;
  "memo.expand": string;
  "memo.closePanel": string;
  "memo.empty": string;
  "memo.loadFailed": string;
  "memo.needsConfig": string;
  "memo.showMore": string;
  "memo.showLess": string;
  "memo.pin": string;
  "memo.unpin": string;
  "memo.edit": string;
  "memo.delete": string;
  "memo.deleteConfirm": string;
  "memo.jump": string;
  "memo.broken": string;
  "memo.discardQuote": string;
  "memo.composerPlaceholder": string;
  "memo.post": string;
  "memo.postFailed": string;
  "memo.updateFailed": string;
  "memo.copy": string;
  "memo.addToMemo": string;
  "memo.copied": string;
  "memo.copyFailed": string;
  "memo.previewOnly": string;
  "memo.hoverCount": string;

  // PDF viewer
  "pdf.open": string;
  "pdf.openFailed": string;
  "pdf.prevPage": string;
  "pdf.nextPage": string;

  // Document placeholders
  "doc.openHtml": string;
  "doc.openImage": string;
  "doc.openText": string;

  // Memo list modal
  "memoList.title": string;
  "memoList.filterPlaceholder": string;
  "memoList.empty": string;
  "memoList.loadFailed": string;
  "memoList.count": string;
}

const en: TranslationStrings = {
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.browse": "Browse",
  "common.loading": "Loading…",

  "topbar.addWidget": "+ Add Widget",
  "topbar.equalizeVertical": "Equalize vertically",
  "topbar.equalizeHorizontal": "Equalize horizontally",
  "topbar.toggleTheme": "Toggle theme",
  "topbar.memoList": "Memo list",
  "topbar.settings": "Settings",
  "appMenu.openDirectory": "Open directory…",
  "appMenu.recent": "Recently opened",
  "appMenu.plugins": "Plugins",

  "settings.title": "Settings",
  "settings.externalEditor": "External editor path",
  "settings.memoSyncTimeline": "Memo sync Timeline",
  "settings.memoSyncTimelineHint": "Append new memo posts to this Timeline. Leave blank to disable. Edits and deletions are not synchronized.",
  "settings.language": "Language",
  "settings.languageSystem": "System",

  "history.title": "History",
  "history.checkpointsSuffix": "checkpoints in this session",
  "history.restore": "Restore",
  "history.current": "Current",
  "history.currentState": "Current state",
  "history.restoreTooltip": "Restore this checkpoint",
  "history.empty": "No checkpoints yet.",
  "history.selectCheckpoint": "Select a checkpoint.",
  "history.noPrevious": "No previous checkpoint.",
  "history.diff": "Diff",
  "history.noTextChanges": "No text content changes",
  "history.noDocumentDiff": "No document diff.",
  "history.unified": "Unified",
  "history.split": "Split",
  "history.reason.initial": "Opened",
  "history.reason.idle": "Idle checkpoint",
  "history.reason.blur": "Focus left",
  "history.reason.manual": "Saved",
  "history.reason.restore": "Restored",
  "history.reason.reload": "Reloaded",
  "history.changed.fileName": "file name",
  "history.changed.document": "document",
  "history.changed.dashboard": "dashboard",
  "history.changed.none": "No content change",
  "history.changed.initial": "Initial state",

  "app.newDocumentConfirm": "Create a new document and replace the current editor content?",

  "widget.move": "Move",
  "widget.resize": "Resize",
  "widget.maximize": "Maximize",
  "widget.restoreSize": "Restore",
  "widget.close": "Close",
  "widget.more": "More",
  "widget.memoTimeline": "Memo timeline",
  "widget.externalEditor": "External editor",
  "widget.externalEditorOpen": "Open in external editor",
  "widget.openLocalFirst": "Open a local file first",
  "widget.reload": "Reload from disk",
  "widget.reloadShort": "Reload",
  "widget.new": "New",
  "widget.file": "File",
  "widget.save": "Save",
  "widget.export": "Export",
  "widget.history": "History",
  "widget.decreaseFont": "Smaller text",
  "widget.increaseFont": "Larger text",
  "widget.narrow": "Narrow content",
  "widget.widen": "Widen content",
  "widget.back": "Back",
  "widget.forward": "Forward",
  "wiki.openNewWidget": "Open in new widget",

  "picker.searchRecent": "Search recent files",
  "picker.searchFiles": "Search files by name or path",
  "picker.files": "Files",
  "picker.recent": "Recent",
  "picker.localFiles": "Local files",
  "picker.noFiles": "No matching files",
  "picker.noRecent": "No recent files",

  "alert.openFileFailed": "Could not open this file.",
  "alert.desktopOnly": "Local file access is available in the Wails desktop app.",
  "alert.reloadFailed": "Could not reload this file.",
  "alert.externalEditorFailed": "Could not open the external editor.",
  "alert.openFromListFailed": "Could not open the file. It may have been moved or deleted.",

  "memo.dirPrompt": "A Workspace directory is required. Open settings?",
  "memo.needsLocalFile": "Memos are available for widgets showing a local file.",
  "memo.panelTitle": "Memo",
  "memo.collapse": "Collapse memo panel",
  "memo.expand": "Open memo panel",
  "memo.closePanel": "Close memo panel",
  "memo.empty": "No memos yet.",
  "memo.loadFailed": "Could not read the memo file.",
  "memo.needsConfig": "Requires a Workspace and a saved local file.",
  "memo.showMore": "Show more",
  "memo.showLess": "Show less",
  "memo.pin": "Pin",
  "memo.unpin": "Unpin",
  "memo.edit": "Edit",
  "memo.delete": "Delete",
  "memo.deleteConfirm": "Delete this memo?",
  "memo.jump": "Jump to the quoted location",
  "memo.broken": "The original location was not found",
  "memo.discardQuote": "Discard quote",
  "memo.composerPlaceholder": "Write a memo…",
  "memo.post": "Post",
  "memo.postFailed": "Could not write the memo file.",
  "memo.updateFailed": "Could not update the memo file.",
  "memo.copy": "Copy",
  "memo.addToMemo": "Add to memo",
  "memo.copied": "Copied",
  "memo.copyFailed": "Could not copy",
  "memo.previewOnly": "Jump is available in Preview mode",
  "memo.hoverCount": "{count} memos",

  "pdf.open": "Open a PDF file.",
  "pdf.openFailed": "Could not open this PDF.",
  "pdf.prevPage": "Previous page",
  "pdf.nextPage": "Next page",

  "doc.openHtml": "Open an HTML file.",
  "doc.openImage": "Open an image file.",
  "doc.openText": "Text file",

  "memoList.title": "Memo list",
  "memoList.filterPlaceholder": "Filter by file name",
  "memoList.empty": "No files with memos found.",
  "memoList.loadFailed": "Could not load the memo list.",
  "memoList.count": "{count} memos",
};

const ja: TranslationStrings = {
  "common.close": "閉じる",
  "common.cancel": "キャンセル",
  "common.save": "保存",
  "common.browse": "参照",
  "common.loading": "読み込み中…",

  "topbar.addWidget": "+ ウィジェット追加",
  "topbar.equalizeVertical": "縦に均等",
  "topbar.equalizeHorizontal": "横に均等",
  "topbar.toggleTheme": "テーマ切替",
  "topbar.memoList": "メモ一覧",
  "topbar.settings": "設定",
  "appMenu.openDirectory": "ディレクトリを開く…",
  "appMenu.recent": "最近開いたディレクトリ",
  "appMenu.plugins": "プラグイン",

  "settings.title": "設定",
  "settings.externalEditor": "外部エディタのパス",
  "settings.memoSyncTimeline": "メモ同期先Timeline",
  "settings.memoSyncTimelineHint": "新規メモをこのTimelineにも追記します。空欄なら無効です。編集と削除は同期しません。",
  "settings.language": "言語",
  "settings.languageSystem": "システム",

  "history.title": "履歴",
  "history.checkpointsSuffix": "件のチェックポイント(このセッション)",
  "history.restore": "復元",
  "history.current": "現在",
  "history.currentState": "現在の状態",
  "history.restoreTooltip": "このチェックポイントを復元",
  "history.empty": "チェックポイントはまだありません。",
  "history.selectCheckpoint": "チェックポイントを選択してください。",
  "history.noPrevious": "前のチェックポイントがありません。",
  "history.diff": "差分",
  "history.noTextChanges": "テキストの変更はありません",
  "history.noDocumentDiff": "ドキュメントの差分はありません。",
  "history.unified": "統合",
  "history.split": "分割",
  "history.reason.initial": "オープン",
  "history.reason.idle": "アイドル時保存",
  "history.reason.blur": "フォーカス喪失",
  "history.reason.manual": "保存",
  "history.reason.restore": "復元",
  "history.reason.reload": "再読込",
  "history.changed.fileName": "ファイル名",
  "history.changed.document": "ドキュメント",
  "history.changed.dashboard": "ダッシュボード",
  "history.changed.none": "内容の変更なし",
  "history.changed.initial": "初期状態",

  "app.newDocumentConfirm": "新しいドキュメントを作成して現在の内容を置き換えますか?",

  "widget.move": "移動",
  "widget.resize": "サイズ変更",
  "widget.maximize": "最大化",
  "widget.restoreSize": "元に戻す",
  "widget.close": "閉じる",
  "widget.more": "その他",
  "widget.memoTimeline": "メモタイムライン",
  "widget.externalEditor": "外部エディタ",
  "widget.externalEditorOpen": "外部エディタで開く",
  "widget.openLocalFirst": "先にローカルファイルを開いてください",
  "widget.reload": "ディスクから再読込",
  "widget.reloadShort": "再読込",
  "widget.new": "新規",
  "widget.file": "ファイル",
  "widget.save": "保存",
  "widget.export": "エクスポート",
  "widget.history": "履歴",
  "widget.decreaseFont": "文字を小さく",
  "widget.increaseFont": "文字を大きく",
  "widget.narrow": "本文幅を狭く",
  "widget.widen": "本文幅を広く",
  "widget.back": "戻る",
  "widget.forward": "進む",
  "wiki.openNewWidget": "新しいWidgetで開く",

  "picker.searchRecent": "最近のファイルを検索",
  "picker.searchFiles": "ファイル名またはパスで検索",
  "picker.files": "ファイル",
  "picker.recent": "最近",
  "picker.localFiles": "ローカルファイル",
  "picker.noFiles": "一致するファイルはありません",
  "picker.noRecent": "最近のファイルはありません",

  "alert.openFileFailed": "このファイルを開けませんでした。",
  "alert.desktopOnly": "ローカルファイルへのアクセスはデスクトップアプリでのみ利用できます。",
  "alert.reloadFailed": "このファイルを再読込できませんでした。",
  "alert.externalEditorFailed": "外部エディタを起動できませんでした。",
  "alert.openFromListFailed": "ファイルを開けませんでした。移動または削除された可能性があります。",

  "memo.dirPrompt": "Workspaceディレクトリが必要です。設定画面を開きますか?",
  "memo.needsLocalFile": "メモはローカルファイルを開いたウィジェットで利用できます。",
  "memo.panelTitle": "メモ",
  "memo.collapse": "パネルを折りたたむ",
  "memo.expand": "パネルを開く",
  "memo.closePanel": "パネルを閉じる",
  "memo.empty": "まだメモがありません。",
  "memo.loadFailed": "メモファイルを読み込めませんでした。",
  "memo.needsConfig": "Workspaceと保存済みファイルが必要です。",
  "memo.showMore": "もっと見る",
  "memo.showLess": "閉じる",
  "memo.pin": "ピン留め",
  "memo.unpin": "ピン解除",
  "memo.edit": "編集",
  "memo.delete": "削除",
  "memo.deleteConfirm": "このメモを削除しますか?",
  "memo.jump": "ドキュメントの該当位置へ移動",
  "memo.broken": "元の位置が見つかりません",
  "memo.discardQuote": "引用を破棄",
  "memo.composerPlaceholder": "メモを書く…",
  "memo.post": "投稿",
  "memo.postFailed": "メモファイルに書き込めませんでした。",
  "memo.updateFailed": "メモファイルを更新できませんでした。",
  "memo.copy": "コピー",
  "memo.addToMemo": "メモに追加",
  "memo.copied": "コピーしました",
  "memo.copyFailed": "コピーできませんでした",
  "memo.previewOnly": "ジャンプは Preview モードで利用できます",
  "memo.hoverCount": "{count}件のメモ",

  "pdf.open": "PDF ファイルを開いてください。",
  "pdf.openFailed": "この PDF を開けませんでした。",
  "pdf.prevPage": "前のページ",
  "pdf.nextPage": "次のページ",

  "doc.openHtml": "HTML ファイルを開いてください。",
  "doc.openImage": "画像ファイルを開いてください。",
  "doc.openText": "テキストファイル",

  "memoList.title": "メモ一覧",
  "memoList.filterPlaceholder": "ファイル名で絞り込み",
  "memoList.empty": "メモのあるファイルが見つかりません。",
  "memoList.loadFailed": "メモ一覧を読み込めませんでした。",
  "memoList.count": "{count}件",
};

const translations: Record<Language, TranslationStrings> = { en, ja };

export function t(language: Language, key: keyof TranslationStrings): string {
  return translations[language]?.[key] ?? translations.en[key] ?? key;
}

// Resolves the effective language from the setting + a browser hint
// (navigator.language), mirroring gemihub's resolve-language.ts.
export function resolveLanguage(setting: LanguageSetting, hint?: string | null): Language {
  if (setting === "en" || setting === "ja") return setting;
  const primary = hint?.split(",")[0]?.split(";")[0]?.trim().toLowerCase().split("-")[0];
  return primary === "ja" ? "ja" : "en";
}

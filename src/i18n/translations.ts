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
  "common.open": string;
  "common.edit": string;
  "common.delete": string;
  "common.undo": string;
  "common.redo": string;

  // Top bar
  "topbar.addWidget": string;
  "topbar.equalizeVertical": string;
  "topbar.equalizeHorizontal": string;
  "topbar.toggleTheme": string;
  "topbar.memoList": string;
  "topbar.launcher": string;
  "topbar.timeline": string;
  "topbar.calendar": string;
  "topbar.kanban": string;
  "topbar.secretManager": string;
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
  "settings.languageJapanese": string;

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
  "history.compareFile": string;
  "history.chooseFile": string;
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
  "widget.newFilePathPrompt": string;
  "widget.newFilePathInvalid": string;
  "widget.newFileExists": string;
  "widget.file": string;
  "widget.save": string;
  "widget.export": string;
  "widget.history": string;
  "widget.diff": string;
  "widget.decreaseFont": string;
  "widget.increaseFont": string;
  "widget.narrow": string;
  "widget.widen": string;
  "widget.back": string;
  "widget.forward": string;
  "wiki.openNewWidget": string;

  // In-document search
  "search.placeholder": string;
  "search.noResults": string;
  "search.previous": string;
  "search.next": string;

  // File picker
  "picker.searchRecent": string;
  "picker.searchFiles": string;
  "picker.files": string;
  "picker.recent": string;
  "picker.localFiles": string;
  "picker.noFiles": string;
  "picker.noRecent": string;
  "picker.workspaceCount": string;
  "picker.recentCount": string;

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
  "memo.askAI": string;
  "memo.askAIEntry": string;
  "memo.askAISelection": string;
  "memo.askAISelectionDraft": string;
  "memo.timelineSyncFailed": string;

  // PDF viewer
  "pdf.open": string;
  "pdf.openFailed": string;
  "pdf.prevPage": string;
  "pdf.nextPage": string;

  // Document placeholders
  "doc.openHtml": string;
  "doc.openImage": string;
  "doc.openText": string;
  "doc.previewUnsupported": string;
  "doc.openExternal": string;
  "doc.htmlOpenFailed": string;
  "doc.htmlConvertFailed": string;
  "doc.openHtmlBrowser": string;
  "doc.convertHtml": string;

  // Workspace file tree / encryption
  "files.workspaceExternal": string;
  "files.showParentDirectory": string;
  "files.memoMoveFailed": string;
  "files.multiSelectHint": string;
  "files.moveToRoot": string;
  "files.encryptPassword": string;
  "files.duplicateNames": string;
  "files.openEncrypted": string;
  "files.encrypt": string;
  "files.moveTitle": string;
  "files.moveConfirmOne": string;
  "files.moveConfirmMany": string;
  "files.moveSource": string;
  "files.moveDestination": string;
  "files.leaveLink": string;
  "files.junctionHint": string;
  "files.symlinkHint": string;
  "files.moving": string;
  "files.moveAction": string;
  "files.moveFailedCopy": string;
  "encrypted.passwordPrompt": string;
  "encrypted.unlockFailed": string;
  "encrypted.saveFailed": string;
  "encrypted.decryptConfirm": string;
  "encrypted.decryptFailed": string;
  "encrypted.epubFailed": string;
  "encrypted.previewOnly": string;
  "encrypted.unsaved": string;
  "encrypted.saved": string;
  "encrypted.permanentDecrypt": string;

  // Calendar
  "calendar.today": string;
  "calendar.events": string;
  "calendar.timeline": string;
  "calendar.add": string;
  "calendar.empty": string;
  "calendar.time": string;
  "calendar.content": string;
  "calendar.saving": string;
  "calendar.previous": string;
  "calendar.next": string;
  "calendar.changed": string;

  // JSON Canvas
  "canvas.invalidShape": string;
  "canvas.parseFailed": string;
  "canvas.fileMissing": string;
  "canvas.fileNotFound": string;
  "canvas.fileReadFailed": string;
  "canvas.openHint": string;
  "canvas.view": string;
  "canvas.textCard": string;
  "canvas.file": string;
  "canvas.link": string;
  "canvas.group": string;
  "canvas.zoomOut": string;
  "canvas.zoomIn": string;
  "canvas.fit": string;
  "canvas.fixJson": string;
  "canvas.filePrompt": string;
  "canvas.urlMissing": string;
  "canvas.color": string;
  "canvas.filePath": string;
  "canvas.connect": string;
  "canvas.resize": string;
  "canvas.empty": string;
  "canvas.emptyEditHint": string;
  "canvas.emptyViewHint": string;
  "canvas.startEditing": string;
  "canvas.connectHint": string;
  "canvas.fileCard": string;
  "canvas.linkCard": string;
  "canvas.edge": string;
  "canvas.label": string;
  "canvas.startArrow": string;
  "canvas.endArrow": string;
  "canvas.defaultColor": string;

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
  "common.open": "Open",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.undo": "Undo",
  "common.redo": "Redo",

  "topbar.addWidget": "+ Add Widget",
  "topbar.equalizeVertical": "Equalize vertically",
  "topbar.equalizeHorizontal": "Equalize horizontally",
  "topbar.toggleTheme": "Toggle theme",
  "topbar.memoList": "Memo list",
  "topbar.launcher": "Launcher",
  "topbar.timeline": "Timeline",
  "topbar.calendar": "Calendar",
  "topbar.kanban": "Kanban",
  "topbar.secretManager": "Secret Manager",
  "topbar.settings": "Settings",
  "appMenu.openDirectory": "Open directory…",
  "appMenu.recent": "Recently opened",
  "appMenu.plugins": "Plugins",

  "settings.title": "Settings",
  "settings.externalEditor": "External editor path",
  "settings.memoSyncTimeline": "Memo sync Timeline",
  "settings.memoSyncTimelineHint":
    "Append new memo posts to this Timeline. Leave blank to disable. Edits and deletions are not synchronized.",
  "settings.language": "Language",
  "settings.languageSystem": "System",
  "settings.languageJapanese": "Japanese",

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
  "history.compareFile": "Compare file",
  "history.chooseFile": "Choose a file…",
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

  "app.newDocumentConfirm":
    "Create a new document and replace the current editor content?",

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
  "widget.newFilePathPrompt": "Workspace path for the new Markdown file",
  "widget.newFilePathInvalid":
    "Enter a valid Workspace-relative Markdown path.",
  "widget.newFileExists": "A file already exists at that Workspace path.",
  "widget.file": "File",
  "widget.save": "Save",
  "widget.export": "Export",
  "widget.history": "History",
  "widget.diff": "Compare files",
  "widget.decreaseFont": "Smaller text",
  "widget.increaseFont": "Larger text",
  "widget.narrow": "Narrow content",
  "widget.widen": "Widen content",
  "widget.back": "Back",
  "widget.forward": "Forward",
  "wiki.openNewWidget": "Open in new widget",

  "search.placeholder": "Find in file",
  "search.noResults": "No results",
  "search.previous": "Previous match",
  "search.next": "Next match",

  "picker.searchRecent": "Search recent files",
  "picker.searchFiles": "Search the Workspace by name or path",
  "picker.files": "Workspace",
  "picker.recent": "Recently opened",
  "picker.localFiles": "Local files…",
  "picker.noFiles": "No matching files",
  "picker.noRecent": "No recent files",
  "picker.workspaceCount": "supported files in the active Workspace",
  "picker.recentCount": "recent files",

  "alert.openFileFailed": "Could not open this file.",
  "alert.desktopOnly":
    "Local file access is available in the Wails desktop app.",
  "alert.reloadFailed": "Could not reload this file.",
  "alert.externalEditorFailed": "Could not open the external editor.",
  "alert.openFromListFailed":
    "Could not open the file. It may have been moved or deleted.",

  "memo.dirPrompt": "A Workspace directory is required. Open settings?",
  "memo.needsLocalFile":
    "Memos are available for widgets showing a local file.",
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
  "memo.askAI": "Ask AI about all memos",
  "memo.askAIEntry": "Ask AI about this memo",
  "memo.askAISelection": "Ask AI",
  "memo.askAISelectionDraft": "I want to ask about this selection:",
  "memo.timelineSyncFailed":
    "The memo was saved, but Timeline sync failed: {error}",

  "pdf.open": "Open a PDF file.",
  "pdf.openFailed": "Could not open this PDF.",
  "pdf.prevPage": "Previous page",
  "pdf.nextPage": "Next page",

  "doc.openHtml": "Open an HTML file.",
  "doc.openImage": "Open an image file.",
  "doc.openText": "Text file",
  "doc.previewUnsupported": "This file type cannot be previewed in the app.",
  "doc.openExternal": "Open in external app",
  "doc.htmlOpenFailed": "Could not open the HTML in a browser.",
  "doc.htmlConvertFailed": "Could not convert to HTML.",
  "doc.openHtmlBrowser":
    "Open in browser (you can save as PDF from the browser's print dialog)",
  "doc.convertHtml": "Convert to HTML",

  "files.workspaceExternal": "Outside Workspace",
  "files.showParentDirectory": "Show parent directory",
  "files.memoMoveFailed":
    "The file was moved, but its memo could not be updated: {error}",
  "files.multiSelectHint": "Ctrl/Cmd or Shift to select multiple",
  "files.moveToRoot": "Move to Workspace root",
  "files.encryptPassword": "Enter an encryption password",
  "files.duplicateNames":
    "Files with the same name cannot be moved to one destination together.",
  "files.openEncrypted": "Open encrypted file",
  "files.encrypt": "Encrypt file",
  "files.moveTitle": "Move into Workspace",
  "files.moveConfirmOne": "Move {name} to another directory?",
  "files.moveConfirmMany": "Move {count} files to another directory?",
  "files.moveSource": "Source",
  "files.moveDestination": "Destination",
  "files.leaveLink": "Leave a link in the original location",
  "files.junctionHint": "Creates a Windows directory junction.",
  "files.symlinkHint": "Creates a symbolic link.",
  "files.moving": "Moving…",
  "files.moveAction": "Move",
  "files.moveFailedCopy":
    "Could not move {name}. Copy it into the Workspace instead?\n\n{error}",
  "encrypted.passwordPrompt": "Enter the password for the encrypted file",
  "encrypted.unlockFailed": "Could not decrypt the file. Check the password.",
  "encrypted.saveFailed":
    "Could not encrypt and save the file. Check the password.",
  "encrypted.decryptConfirm": "Decrypt {name} to a regular file?",
  "encrypted.decryptFailed": "Could not decrypt the file.",
  "encrypted.epubFailed": "Could not display the EPUB.",
  "encrypted.previewOnly": "Preview only",
  "encrypted.unsaved": "Unsaved changes",
  "encrypted.saved": "Saved",
  "encrypted.permanentDecrypt": "Decrypt to regular file",

  "calendar.today": "Today",
  "calendar.events": "Events",
  "calendar.timeline": "Timeline",
  "calendar.add": "Add event",
  "calendar.empty": "Nothing on this day.",
  "calendar.time": "Time (optional)",
  "calendar.content": "Content",
  "calendar.saving": "Saving…",
  "calendar.previous": "Previous month",
  "calendar.next": "Next month",
  "calendar.changed": "Event date changed.",

  "canvas.invalidShape": "Canvas requires nodes and edges arrays.",
  "canvas.parseFailed": "Could not parse Canvas JSON: {error}",
  "canvas.fileMissing": "No file specified",
  "canvas.fileNotFound": "File not found",
  "canvas.fileReadFailed": "Could not read file",
  "canvas.openHint": "Double-click to open",
  "canvas.view": "View",
  "canvas.textCard": "Text card",
  "canvas.file": "File",
  "canvas.link": "Link",
  "canvas.group": "Group",
  "canvas.zoomOut": "Zoom out",
  "canvas.zoomIn": "Zoom in",
  "canvas.fit": "Fit canvas",
  "canvas.fixJson": "Fix JSON",
  "canvas.filePrompt": "File path to reference from Canvas",
  "canvas.urlMissing": "No URL specified",
  "canvas.color": "Color",
  "canvas.filePath": "File path",
  "canvas.connect": "Connect",
  "canvas.resize": "Resize",
  "canvas.empty": "Empty Canvas",
  "canvas.emptyEditHint": "Add a card from the toolbar.",
  "canvas.emptyViewHint": "Switch to edit mode to add a card.",
  "canvas.startEditing": "Start editing",
  "canvas.connectHint":
    "Select the destination card and click the edge dot. Press Esc to cancel.",
  "canvas.fileCard": "File card",
  "canvas.linkCard": "Link card",
  "canvas.edge": "Connection",
  "canvas.label": "Label",
  "canvas.startArrow": "Start arrow",
  "canvas.endArrow": "End arrow",
  "canvas.defaultColor": "Default",

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
  "common.open": "開く",
  "common.edit": "編集",
  "common.delete": "削除",
  "common.undo": "元に戻す",
  "common.redo": "やり直す",

  "topbar.addWidget": "+ ウィジェット追加",
  "topbar.equalizeVertical": "縦に均等",
  "topbar.equalizeHorizontal": "横に均等",
  "topbar.toggleTheme": "テーマ切替",
  "topbar.memoList": "メモ一覧",
  "topbar.launcher": "ランチャー",
  "topbar.timeline": "タイムライン",
  "topbar.calendar": "カレンダー",
  "topbar.kanban": "カンバン",
  "topbar.secretManager": "シークレットマネージャー",
  "topbar.settings": "設定",
  "appMenu.openDirectory": "ディレクトリを開く…",
  "appMenu.recent": "最近開いたディレクトリ",
  "appMenu.plugins": "プラグイン",

  "settings.title": "設定",
  "settings.externalEditor": "外部エディタのパス",
  "settings.memoSyncTimeline": "メモ同期先Timeline",
  "settings.memoSyncTimelineHint":
    "新規メモをこのTimelineにも追記します。空欄なら無効です。編集と削除は同期しません。",
  "settings.language": "言語",
  "settings.languageSystem": "システム",
  "settings.languageJapanese": "日本語",

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
  "history.compareFile": "別ファイルと比較",
  "history.chooseFile": "比較するファイルを選択…",
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

  "app.newDocumentConfirm":
    "新しいドキュメントを作成して現在の内容を置き換えますか?",

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
  "widget.newFilePathPrompt": "新しいMarkdownファイルのWorkspace内パス",
  "widget.newFilePathInvalid":
    "有効なWorkspace相対のMarkdownパスを入力してください。",
  "widget.newFileExists": "そのWorkspaceパスには既にファイルがあります。",
  "widget.file": "ファイル",
  "widget.save": "保存",
  "widget.export": "エクスポート",
  "widget.history": "履歴",
  "widget.diff": "別ファイルと比較",
  "widget.decreaseFont": "文字を小さく",
  "widget.increaseFont": "文字を大きく",
  "widget.narrow": "本文幅を狭く",
  "widget.widen": "本文幅を広く",
  "widget.back": "戻る",
  "widget.forward": "進む",
  "wiki.openNewWidget": "新しいWidgetで開く",

  "search.placeholder": "ファイル内を検索",
  "search.noResults": "一致なし",
  "search.previous": "前の一致",
  "search.next": "次の一致",

  "picker.searchRecent": "最近のファイルを検索",
  "picker.searchFiles": "Workspaceをファイル名またはパスで検索",
  "picker.files": "Workspace",
  "picker.recent": "最近開いたファイル",
  "picker.localFiles": "ローカルファイルを選択…",
  "picker.noFiles": "一致するファイルはありません",
  "picker.noRecent": "最近のファイルはありません",
  "picker.workspaceCount": "件の対応ファイル（現在のWorkspace）",
  "picker.recentCount": "件の最近開いたファイル",

  "alert.openFileFailed": "このファイルを開けませんでした。",
  "alert.desktopOnly":
    "ローカルファイルへのアクセスはデスクトップアプリでのみ利用できます。",
  "alert.reloadFailed": "このファイルを再読込できませんでした。",
  "alert.externalEditorFailed": "外部エディタを起動できませんでした。",
  "alert.openFromListFailed":
    "ファイルを開けませんでした。移動または削除された可能性があります。",

  "memo.dirPrompt": "Workspaceディレクトリが必要です。設定画面を開きますか?",
  "memo.needsLocalFile":
    "メモはローカルファイルを開いたウィジェットで利用できます。",
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
  "memo.askAI": "メモ全体についてAIに質問",
  "memo.askAIEntry": "このメモについてAIに質問",
  "memo.askAISelection": "AIに相談",
  "memo.askAISelectionDraft": "この選択範囲について質問します:",
  "memo.timelineSyncFailed":
    "メモは保存されましたが、Timelineへの連携に失敗しました: {error}",

  "pdf.open": "PDF ファイルを開いてください。",
  "pdf.openFailed": "この PDF を開けませんでした。",
  "pdf.prevPage": "前のページ",
  "pdf.nextPage": "次のページ",

  "doc.openHtml": "HTML ファイルを開いてください。",
  "doc.openImage": "画像ファイルを開いてください。",
  "doc.openText": "テキストファイル",
  "doc.previewUnsupported":
    "このファイル形式はアプリ内でプレビューできません。",
  "doc.openExternal": "外部アプリで開く",
  "doc.htmlOpenFailed": "ブラウザでHTMLを開けませんでした。",
  "doc.htmlConvertFailed": "HTMLへ変換できませんでした。",
  "doc.openHtmlBrowser": "ブラウザで開く（ブラウザの印刷からPDF保存できます）",
  "doc.convertHtml": "HTMLに変換",

  "files.workspaceExternal": "Workspace外",
  "files.showParentDirectory": "親ディレクトリを開く",
  "files.memoMoveFailed":
    "ファイルは移動しましたが、メモを更新できませんでした: {error}",
  "files.multiSelectHint": "Ctrl/Cmd・Shiftで複数選択",
  "files.moveToRoot": "Workspace直下へ移動",
  "files.encryptPassword": "暗号化パスワードを入力してください",
  "files.duplicateNames":
    "同名のファイルが含まれているため、まとめて同じ移動先へ移動できません。",
  "files.openEncrypted": "暗号化ファイルを開く",
  "files.encrypt": "ファイルを暗号化",
  "files.moveTitle": "Workspaceへ移動",
  "files.moveConfirmOne":
    "{name}を別ディレクトリへ移動します。よろしいですか？",
  "files.moveConfirmMany":
    "{count}個のファイルを別ディレクトリへ移動します。よろしいですか？",
  "files.moveSource": "移動元",
  "files.moveDestination": "移動先",
  "files.leaveLink": "元の場所にリンクを残す",
  "files.junctionHint": "WindowsのディレクトリJunctionを作成します。",
  "files.symlinkHint": "シンボリックリンクを作成します。",
  "files.moving": "移動中…",
  "files.moveAction": "移動する",
  "files.moveFailedCopy":
    "{name}を移動できませんでした。代わりにWorkspaceへコピーしますか？\n\n{error}",
  "encrypted.passwordPrompt": "暗号化ファイルのパスワードを入力してください",
  "encrypted.unlockFailed":
    "復号できませんでした。パスワードを確認してください。",
  "encrypted.saveFailed":
    "暗号化して保存できませんでした。パスワードを確認してください。",
  "encrypted.decryptConfirm": "{name}を通常ファイルへ復号しますか？",
  "encrypted.decryptFailed": "ファイルを復号できませんでした。",
  "encrypted.epubFailed": "EPUBを表示できませんでした。",
  "encrypted.previewOnly": "プレビューのみ",
  "encrypted.unsaved": "未保存の変更があります",
  "encrypted.saved": "保存済み",
  "encrypted.permanentDecrypt": "通常ファイルへ復号",

  "calendar.today": "今日",
  "calendar.events": "予定",
  "calendar.timeline": "Timeline",
  "calendar.add": "予定を追加",
  "calendar.empty": "この日の項目はありません。",
  "calendar.time": "時刻（任意）",
  "calendar.content": "内容",
  "calendar.saving": "保存中…",
  "calendar.previous": "前の月",
  "calendar.next": "次の月",
  "calendar.changed": "予定の日付を変更しました。",

  "canvas.invalidShape": "Canvasにはnodesとedgesの配列が必要です。",
  "canvas.parseFailed": "Canvas JSONを解析できません: {error}",
  "canvas.fileMissing": "ファイルが未指定です",
  "canvas.fileNotFound": "ファイルが見つかりません",
  "canvas.fileReadFailed": "ファイルを読み込めません",
  "canvas.openHint": "ダブルクリックで開く",
  "canvas.view": "表示",
  "canvas.textCard": "テキストカード",
  "canvas.file": "ファイル",
  "canvas.link": "リンク",
  "canvas.group": "グループ",
  "canvas.zoomOut": "縮小",
  "canvas.zoomIn": "拡大",
  "canvas.fit": "全体を表示",
  "canvas.fixJson": "JSONを修正",
  "canvas.filePrompt": "Canvasから参照するファイルパス",
  "canvas.urlMissing": "URLが未指定です",
  "canvas.color": "色",
  "canvas.filePath": "ファイルパス",
  "canvas.connect": "接続",
  "canvas.resize": "サイズ変更",
  "canvas.empty": "空のCanvas",
  "canvas.emptyEditHint": "ツールバーからカードを追加できます。",
  "canvas.emptyViewHint": "編集モードにするとカードを追加できます。",
  "canvas.startEditing": "編集を開始",
  "canvas.connectHint":
    "接続先のカードを選び、辺の●をクリックしてください。Escで中止",
  "canvas.fileCard": "ファイルカード",
  "canvas.linkCard": "リンクカード",
  "canvas.edge": "接続線",
  "canvas.label": "ラベル",
  "canvas.startArrow": "始点矢印",
  "canvas.endArrow": "終点矢印",
  "canvas.defaultColor": "既定",

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
export function resolveLanguage(
  setting: LanguageSetting,
  hint?: string | null,
): Language {
  if (setting === "en" || setting === "ja") return setting;
  const primary = hint?.split(",")[0]?.split(";")[0]?.trim().toLowerCase()
    .split("-")[0];
  return primary === "ja" ? "ja" : "en";
}

// UI translations, mirroring gemihub's app/i18n/translations.ts shape:
// a flat key interface with per-language tables and a t() lookup.

export type Language = "en" | "ja";
export type LanguageSetting = Language | "system";

export interface TranslationStrings {
  "speech.error.project": string;
  "speech.error.url": string;
  "speech.error.duration": string;
  "speech.error.empty": string;
  "speech.error.combinedDuration": string;
  "speech.error.geminiKey": string;
  "speech.error.azureKey": string;
  "speech.error.azureAuth": string;
  "speech.error.azureInvalid": string;
  "speech.error.language": string;
  "speech.error.model": string;
  "speech.error.invalid": string;
  "speech.error.blocked": string;
  "speech.error.incomplete": string;
  "speech.error.totalDuration": string;
  "speech.error.json": string;
  "speech.error.text": string;
  "speech.error.vertexAuth": string;
  "speech.error.geminiAuth": string;
  "speech.error.auth": string;
  "speech.error.server": string;

  "speech.browser": string;
  "speech.browserHint": string;
  "speech.api": string;
  "speech.apiHint": string;
  "speech.noMic": string;
  "speech.connected": string;
  "speech.title": string;
  "speech.subtitle": string;
  "speech.osTitle": string;
  "speech.osHint": string;
  "speech.inApp": string;
  "speech.method": string;
  "speech.micLanguage": string;
  "speech.mic": string;
  "speech.defaultMic": string;
  "speech.testMic": string;
  "speech.language": string;
  "speech.languageAuto": string;
  "speech.languageOther": string;
  "speech.browserLanguageHint": string;
  "speech.googleLanguages": string;
  "speech.languages": string;
  "speech.silence": string;
  "speech.off": string;
  "speech.seconds": string;
  "speech.silenceHelp": string;
  "speech.connection": string;
  "speech.service": string;
  "speech.custom": string;
  "speech.vertexHelp": string;
  "speech.geminiHelp": string;
  "speech.azureMaiHelp": string;
  "speech.whisperHelp": string;
  "speech.openaiHelp": string;
  "speech.customHelp": string;
  "speech.urlHelp": string;
  "speech.required": string;
  "speech.optional": string;
  "speech.geminiKey": string;
  "speech.openaiKey": string;
  "speech.noAuth": string;
  "speech.keyHelp": string;
  "speech.model": string;
  "speech.serverModel": string;
  "speech.testConnection": string;
  "speech.testHelp": string;
  "speech.costHelp": string;
  "speech.checkingMic": string;
  "speech.checkingConnection": string;
  "speech.stop": string;
  "speech.sending": string;
  "speech.shortcut": string;
  "speech.shortcutPlaceholder": string;
  "speech.shortcutHint": string;
  "speech.shortcutSaved": string;
  "speech.shortcutHelp": string;
  "speech.shortcutCleared": string;
  "speech.clearShortcut": string;
  "speech.sendPhrase": string;
  "speech.phrasePlaceholder": string;
  "speech.phraseHelp": string;
  "speech.browserSendHelp": string;
  "speech.apiSendHelp": string;
  "speech.browserFooter": string;
  "speech.apiFooter": string;
  "speech.meter": string;
  "speech.noMeter": string;
  "speech.level": string;
  "speech.noLevel": string;
  "speech.listening": string;
  "speech.starting": string;
  "speech.preparing": string;
  "speech.transcribing": string;
  "speech.recordingAndSending": string;
  "speech.sendingWhileRecording": string;
  "speech.endPhraseHint": string;
  "speech.replacementSpoken": string;
  "speech.replacementResult": string;
  "speech.replacementSpokenPlaceholder": string;
  "speech.replacementRemove": string;
  "speech.replacementAdd": string;
  "speech.replacementHelp": string;
  "speech.liveHint": string;
  "speech.recordHint": string;
  "speech.cancelHint": string;
  "speech.retainHint": string;
  "speech.waiting": string;
  "speech.empty": string;
  "speech.retainedLimit": string;
  "speech.noRecording": string;
  "speech.sizeLimit": string;
  "speech.recordError": string;
  "speech.noSilence": string;
  "speech.noBrowser": string;
  "speech.denied": string;
  "speech.serviceDenied": string;
  "speech.captureError": string;
  "speech.networkError": string;
  "speech.noSpeech": string;
  "speech.adding": string;
  "speech.addHint": string;
  "speech.retainedHelp": string;
  "speech.retry": string;
  "speech.cancelLabel": string;
  "speech.stopLabel": string;
  "speech.stopListening": string;
  "speech.unsupported": string;
  "speech.micChecked": string;
  "speech.sharedSettings": string;
  "speech.or": string;
  "speech.key": string;
  "speech.elapsed": string;
  "speech.retainedCount": string;
  "speech.autoStopHint": string;
  "speech.recognitionError": string;
  "speech.startError": string;
  "speech.recordStartError": string;
  "speech.live": string;
  "speech.liveProviderHint": string;
  "speech.questionCommand": string;
  "speech.newlineCommand": string;
  "speech.exclamationCommand": string;
  "speech.readAloud": string;
  "speech.autoReadAloud": string;
  "speech.autoReadAloudHelp": string;
  "speech.readAloudRate": string;
  "speech.readAloudRateHelp": string;
  "speech.readAloudChip": string;
  "speech.readAloudChipOff": string;
  "speech.voiceMode": string;
  "speech.voiceModeHelp": string;
  "speech.voiceModeEnd": string;

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
  "topbar.newTimeline": string;
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

  // MCP approvals
  "mcp.approvals": string;
  "mcp.autoApprove": string;
  "mcp.autoApproveHint": string;
  "mcp.allowedTools": string;
  "mcp.allowedToolsHint": string;
  "mcp.allowedToolsEmpty": string;
  "mcp.removeTool": string;
  "mcp.approval.title": string;
  "mcp.approval.deny": string;
  "mcp.approval.once": string;
  "mcp.approval.always": string;

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
  "history.fileVersion": string;
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
  "speech.error.project": "Set the Vertex AI Project ID.",
  "speech.error.url":
    "Use an HTTP(S) base URL without credentials, a query, or a fragment.",
  "speech.error.duration": "Keep recordings within 5 minutes.",
  "speech.error.empty": "The recording is empty.",
  "speech.error.combinedDuration":
    "Keep recordings, including retained audio, within 5 minutes.",
  "speech.error.geminiKey": "Set a Google AI Studio Gemini API key.",
  "speech.error.azureKey": "Set the Azure Speech API key.",
  "speech.error.azureAuth":
    "Check the Azure Speech endpoint, API key, region, and MAI Transcribe access.",
  "speech.error.azureInvalid":
    "Azure MAI Transcribe returned an invalid response.",
  "speech.error.language":
    "Set recognition language to auto or a language code such as ja-JP or en-US.",
  "speech.error.model": "Set the transcription model.",
  "speech.error.invalid": "Gemini Transcribe returned an invalid response.",
  "speech.error.blocked": "Gemini Transcribe refused to process the audio.",
  "speech.error.incomplete":
    "Gemini Transcribe did not complete transcription. Please make a shorter recording.",
  "speech.error.totalDuration":
    "Keep recordings within 5 minutes, including retained audio.",
  "speech.error.json": "The transcription response is not JSON.",
  "speech.error.text": "The transcription response has no text field.",
  "speech.error.vertexAuth":
    "Check the Vertex AI Google sign-in, Project ID, API activation, and model permissions.",
  "speech.error.geminiAuth":
    "Check the Gemini API key, API activation, and billing settings.",
  "speech.error.auth": "Check the API key and server authentication settings.",
  "speech.error.server":
    "Check the base URL, model, and supported server formats.",

  "speech.browser": "Browser",
  "speech.browserHint": "Transcribe as you speak",
  "speech.api": "Speech recognition API",
  "speech.apiHint": "OpenAI / Google Cloud and more",
  "speech.noMic": "The microphone is unavailable in this environment.",
  "speech.connected":
    "Connected. Audio upload and transcription response verified.",
  "speech.title": "Voice input",
  "speech.subtitle": "Turn your speech into a Chat draft.",
  "speech.osTitle": "Try your system’s built-in dictation first",
  "speech.osHint":
    "System dictation may work better for your voice and environment. Click the Chat input, then use these keys to start. No API key is needed.",
  "speech.inApp": "Use in-app speech recognition",
  "speech.method": "Speech recognition method",
  "speech.micLanguage": "Microphone and language",
  "speech.mic": "Microphone",
  "speech.defaultMic": "System default microphone",
  "speech.testMic": "Test microphone",
  "speech.language": "Recognition language",
  "speech.browserLanguageHint":
    "Automatic uses the app language. Available languages depend on the WebView.",
  "speech.languageAuto": "Automatic",
  "speech.languageOther": "Other (language code)",
  "speech.googleLanguages":
    "auto: detect automatically / ja-JP: Japanese / en-US: English",
  "speech.languages": "auto: detect automatically / ja: Japanese / en: English",
  "speech.silence": "Stop automatically after silence",
  "speech.off": "Off (stop manually)",
  "speech.seconds": "s",
  "speech.silenceHelp":
    "After you start speaking, the selected period of silence stops recording and starts transcription. A send phrase sends the message; otherwise it stays in the draft. Background noise may affect timing.",
  "speech.connection": "Connection",
  "speech.service": "Service",
  "speech.custom": "Other (OpenAI-compatible API)",
  "speech.vertexHelp":
    "Sign in to Google under Vertex AI in AI settings. Uses the Transcribe preview in the global region.",
  "speech.geminiHelp":
    "Transcribe with a Google AI Studio Gemini API key. Recordings, including retained audio, can total up to 5 minutes.",
  "speech.azureMaiHelp":
    "Uses Azure Speech Fast Transcription with a selectable MAI Transcribe model. Availability depends on the resource region.",
  "speech.whisperHelp": "Connects to the standard whisper.cpp server.",
  "speech.openaiHelp":
    "Transcribe audio with the OpenAI API key from AI settings.",
  "speech.customHelp": "Set the base URL, model, and API key for your service.",
  "speech.urlHelp":
    "Selecting a service fills in defaults. You can edit them for your endpoint.",
  "speech.required": "Required",
  "speech.optional": "Optional",
  "speech.geminiKey": "Google AI Studio Gemini API key",
  "speech.openaiKey": "OpenAI API key",
  "speech.noAuth": "Leave blank if authentication is not required",
  "speech.keyHelp":
    "No matching API key is configured in AI settings. Enter a voice input key here; a key added to AI settings will be used automatically.",
  "speech.model": "Model",
  "speech.serverModel": "Model loaded on the server",
  "speech.testConnection": "Test connection",
  "speech.testHelp":
    "Sends a short silent audio sample to check the response. ",
  "speech.costHelp": "Gemini API charges may apply.",
  "speech.checkingMic": "Checking microphone",
  "speech.checkingConnection": "Checking connection",
  "speech.stop": "Stop",
  "speech.sending": "Sending",
  "speech.shortcut": "Voice button shortcut",
  "speech.shortcutPlaceholder": "Click and press keys (e.g. Ctrl + Shift + M)",
  "speech.shortcutHint":
    "Press Ctrl, Alt, or ⌘ together with a letter, number, or another key.",
  "speech.shortcutSaved": "Shortcut saved.",
  "speech.shortcutHelp":
    "Starts, stops, or cancels transcription while the app is active, opening Chat if needed. Disabled in settings. System shortcuts may take precedence.",
  "speech.shortcutCleared": "Shortcut cleared.",
  "speech.clearShortcut": "Clear shortcut",
  "speech.sendPhrase": "Send phrase",
  "speech.phrasePlaceholder": "e.g. over, send it",
  "speech.phraseHelp":
    "Separate phrases with commas. Leave blank to disable automatic sending.",
  "speech.browserSendHelp":
    "When finalized text ends with a send phrase, the phrase is removed and the message is sent.",
  "speech.apiSendHelp":
    "After an automatic or manual stop, a trailing send phrase is removed and the message is sent. Otherwise, the transcription stays in the draft.",
  "speech.browserFooter":
    "Text appears in the input as you speak. Availability depends on the browser’s speech recognition support.",
  "speech.apiFooter":
    "Press Stop to transcribe your recording. Audio is sent to the configured service.",
  "speech.meter": "Microphone input level",
  "speech.noMeter": "Input level display unavailable",
  "speech.level": "Input level",
  "speech.noLevel": "No input level display",
  "speech.listening": "Listening",
  "speech.starting": "Preparing microphone",
  "speech.preparing": "Preparing audio",
  "speech.transcribing": "Transcribing audio",
  "speech.recordingAndSending": "Recording · Sending for transcription",
  "speech.sendingWhileRecording":
    "Sending the previous segment; microphone remains active.",
  "speech.endPhraseHint": "End automatically by saying: {phrase}",
  "speech.replacementSpoken": "Spoken phrase",
  "speech.replacementResult": "Replacement",
  "speech.replacementSpokenPlaceholder": "e.g. daily note",
  "speech.replacementRemove": "Remove replacement rule",
  "speech.replacementAdd": "Add a rule",
  "speech.replacementHelp":
    "Use one row per phrase. The longest matching phrase is replaced first.",
  "speech.liveHint":
    "Your words appear in the input as you speak. Press Stop to finish.",
  "speech.recordHint":
    "Press Stop to finish recording and start transcription.",
  "speech.cancelHint": "Press Stop to cancel",
  "speech.retainHint": "Press Stop to cancel transcription (audio is retained)",
  "speech.waiting":
    "Waiting for the server. Processing time depends on recording length and model.",
  "speech.empty": "No speech was recognized. Please record again.",
  "speech.retainedLimit":
    "Retained recordings have reached 5 minutes. Select “Transcribe retained recordings”.",
  "speech.noRecording":
    "Microphone recording is not supported in this environment.",
  "speech.sizeLimit":
    "The recording size limit was reached. Please make a shorter recording.",
  "speech.recordError":
    "Recording failed. Check your microphone connection and permissions.",
  "speech.noSilence":
    "Silence detection is unavailable. Press Stop to finish recording.",
  "speech.noBrowser":
    "Speech recognition (SpeechRecognition) is not supported in this environment.",
  "speech.denied":
    "Microphone access was denied. Check app and system microphone permissions.",
  "speech.serviceDenied":
    "The speech recognition service is unavailable in this environment.",
  "speech.captureError":
    "The microphone is unavailable. Check its connection and settings.",
  "speech.networkError": "Cannot connect to the speech recognition service.",
  "speech.noSpeech":
    "No speech was detected. Press the microphone button to try again.",
  "speech.adding": "Adding audio to transcribe together.",
  "speech.addHint":
    "Retry transcribes the retained audio; starting a new recording discards it.",
  "speech.retainedHelp":
    "Recordings are cleared after successful transcription. Retrying resends retained audio and may increase API usage.",
  "speech.retry": "Transcribe retained recordings",
  "speech.cancelLabel": "Stop (cancel transcription)",
  "speech.stopLabel": "Stop listening",
  "speech.stopListening": "Stop listening",
  "speech.unsupported": "Voice input unavailable (click for details)",
  "speech.micChecked": "Microphone verified",
  "speech.sharedSettings": "Use current {service} settings",
  "speech.or": "or",
  "speech.key": "key",
  "speech.elapsed": "Elapsed time: {seconds}s",
  "speech.retainedCount": "{count} recording(s) retained. ",
  "speech.autoStopHint":
    "Transcribes after about {seconds} seconds of silence; the microphone stays on.",
  "speech.recognitionError": "Speech recognition",
  "speech.startError": "Cannot start speech recognition",
  "speech.recordStartError": "Cannot start recording",
  "speech.live": "Live transcription",
  "speech.liveProviderHint": "OpenAI / Gemini / Vertex AI",
  "speech.questionCommand": "Question command",
  "speech.newlineCommand": "Line break command",
  "speech.exclamationCommand": "Exclamation command",
  "speech.readAloud": "Read aloud",
  "speech.autoReadAloud": "Read answers aloud automatically",
  "speech.autoReadAloudHelp":
    "After each answer finishes, it is spoken with the system voice. Answers are kept short and speakable.",
  "speech.readAloudRate": "Read-aloud speed",
  "speech.readAloudRateHelp":
    "Adjusts the speech rate. 1.0× is the system default.",
  "speech.readAloudChip": "Reading aloud",
  "speech.readAloudChipOff": "Turn off read-aloud",
  "speech.voiceMode": "Voice mode",
  "speech.voiceModeHelp": "The microphone reopens after each answer",
  "speech.voiceModeEnd": "Stop reopening the microphone automatically",

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
  "topbar.newTimeline": "Write to Timeline",
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

  "mcp.approvals": "Tool call approval",
  "mcp.autoApprove": "Always approve (skip confirmation)",
  "mcp.autoApproveHint":
    "Every tool call from this server runs without asking.",
  "mcp.allowedTools": "Allowed tools",
  "mcp.allowedToolsHint":
    "Tools approved with “Always allow” run without asking. Remove one to be asked again.",
  "mcp.allowedToolsEmpty": "No tools are pre-approved.",
  "mcp.removeTool": "Remove",
  "mcp.approval.title": "Approve MCP tool call",
  "mcp.approval.deny": "Deny",
  "mcp.approval.once": "Allow once",
  "mcp.approval.always": "Always allow this tool",

  "history.title": "History",
  "history.checkpointsSuffix": "memory checkpoints and saved file versions",
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
  "history.fileVersion": "Saved file version",
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
  "speech.error.project": "Vertex AIのProject IDを設定してください。",
  "speech.error.url":
    "Base URLには認証情報・クエリ・フラグメントを含まないHTTP(S) URLを指定してください。",
  "speech.error.duration": "録音は5分以内にしてください。",
  "speech.error.empty": "録音が空です。",
  "speech.error.combinedDuration":
    "保持分を含めた録音は5分以内にしてください。",
  "speech.error.geminiKey":
    "Google AI StudioのGemini API Keyを設定してください。",
  "speech.error.azureKey": "Azure SpeechのAPI Keyを設定してください。",
  "speech.error.azureAuth":
    "Azure Speechのエンドポイント・API Key・リージョン・MAI Transcribeの利用権限を確認してください。",
  "speech.error.azureInvalid": "Azure MAI Transcribeの応答形式が不正です。",
  "speech.error.language":
    "認識する言語はautoまたはja-JPやen-USなどの言語コードを指定してください。",
  "speech.error.model": "STTのModelを設定してください。",
  "speech.error.invalid": "Gemini Transcribeの応答形式が不正です。",
  "speech.error.blocked": "Gemini Transcribeが音声の処理を拒否しました。",
  "speech.error.incomplete":
    "Gemini Transcribeの文字起こしが完了しませんでした。短く録音し直してください。",
  "speech.error.totalDuration": "録音は保持分を含めて5分以内にしてください。",
  "speech.error.json": "STTの応答がJSONではありません。",
  "speech.error.text": "STTの応答にtextフィールドがありません。",
  "speech.error.vertexAuth":
    "Vertex AIのGoogleログイン・Project ID・APIの有効化・モデルの利用権限を確認してください。",
  "speech.error.geminiAuth":
    "Gemini API Key・APIの有効化・請求設定を確認してください。",
  "speech.error.auth": "API Keyとサーバーの認証設定を確認してください。",
  "speech.error.server":
    "Base URL・Model・サーバーの対応形式を確認してください。",

  "speech.browser": "ブラウザ",
  "speech.browserHint": "話しながら文字に",
  "speech.api": "音声認識API",
  "speech.apiHint": "OpenAI / Google Cloud など",
  "speech.noMic": "この環境ではマイクを利用できません。",
  "speech.connected":
    "接続できました。音声の送信と文字起こし応答を確認しました。",
  "speech.title": "音声入力",
  "speech.subtitle": "マイクで話した内容を、Chatの下書きに。",
  "speech.osTitle": "まずはOS標準の音声入力を試してみてください",
  "speech.osHint":
    "環境や話し方によっては、OS標準のほうが高い精度で認識できることがあります。Chatの入力欄をクリックしてから、次のキーで始められます。APIキーの設定は不要です。",
  "speech.inApp": "アプリ内の音声認識を使う",
  "speech.method": "音声認識の方式",
  "speech.micLanguage": "マイクと言語",
  "speech.mic": "マイク",
  "speech.defaultMic": "システムの既定のマイク",
  "speech.testMic": "マイクを確認",
  "speech.language": "認識する言語",
  "speech.browserLanguageHint":
    "自動ではアプリの表示言語を使います。利用可能な言語はWebViewに依存します。",
  "speech.languageAuto": "自動判定",
  "speech.languageOther": "その他（言語コード指定）",
  "speech.googleLanguages": "auto：自動判定 / ja-JP：日本語 / en-US：英語",
  "speech.languages": "auto：自動判定 / ja：日本語 / en：英語",
  "speech.silence": "無音で自動停止",
  "speech.off": "オフ（手動で停止）",
  "speech.seconds": "秒",
  "speech.silenceHelp":
    "話し始めた後、指定秒数の無音が続くと録音を終了して文字起こしします。送信の合図があれば送信し、なければ下書きに残します。周囲の音によって停止タイミングは変わります。",
  "speech.connection": "接続先",
  "speech.service": "サービス",
  "speech.custom": "その他（OpenAI互換API）",
  "speech.vertexHelp":
    "AI設定のVertex AIでGoogleに接続してください。globalリージョンのTranscribeプレビュー版を使用します。",
  "speech.geminiHelp":
    "Google AI StudioのGemini APIキーで文字起こしします。録音は保持分を含めて最大5分です。",
  "speech.azureMaiHelp":
    "Azure SpeechのFast Transcription APIを使用します。MAI Transcribeモデルを選択でき、利用可否はリソースのリージョンに依存します。",
  "speech.whisperHelp": "whisper.cpp標準サーバーに合わせて接続します。",
  "speech.openaiHelp": "AI設定のOpenAI APIキーで音声を文字起こしします。",
  "speech.customHelp":
    "Base URL・モデル・APIキーを接続先に合わせて設定してください。",
  "speech.urlHelp":
    "サービス選択時に初期値を入力します。接続先に合わせて自由に編集できます。",
  "speech.required": "必須",
  "speech.optional": "任意",
  "speech.geminiKey": "Google AI StudioのGemini APIキー",
  "speech.openaiKey": "OpenAIのAPIキー",
  "speech.noAuth": "認証不要なら空欄",
  "speech.keyHelp":
    "AI設定に対応するAPIキーが未登録のため、音声入力用のキーを設定してください。AI設定に登録すると、そちらを自動で使用します。",
  "speech.model": "モデル",
  "speech.serverModel": "サーバーで読み込み済みのモデル",
  "speech.testConnection": "接続テスト",
  "speech.testHelp": "短い無音データを送って応答を確認します。",
  "speech.costHelp": "Gemini APIの利用料金が発生する場合があります。",
  "speech.checkingMic": "マイクを確認中",
  "speech.checkingConnection": "接続を確認中",
  "speech.stop": "停止",
  "speech.sending": "送信操作",
  "speech.shortcut": "音声ボタンのショートカット",
  "speech.shortcutPlaceholder":
    "クリックしてキーを押す（例：Ctrl + Shift + M）",
  "speech.shortcutHint":
    "Ctrl・Alt・⌘のいずれかと、文字・数字などのキーを同時に押してください。",
  "speech.shortcutSaved": "ショートカットを保存しました。",
  "speech.shortcutHelp":
    "アプリがアクティブなとき、開始・停止・解析キャンセルを切り替えます。Chatが閉じていれば開きます。設定画面では無効です。OSが使用するキーは反応しない場合があります。",
  "speech.shortcutCleared": "ショートカットを解除しました。",
  "speech.clearShortcut": "割り当てを解除",
  "speech.sendPhrase": "送信の合図",
  "speech.phrasePlaceholder": "例：over, オーバー, 送信して",
  "speech.phraseHelp":
    "複数の合図はカンマで区切ります。空欄にすると自動送信しません。",
  "speech.browserSendHelp":
    "確定した文章の末尾が合図と一致したとき、合図を除いて送信します。",
  "speech.apiSendHelp":
    "無音での自動停止または停止ボタンの後、文字起こしの末尾に合図があれば、合図を除いて送信します。合図がなければ下書きに残します。",
  "speech.browserFooter":
    "話している途中の文字も入力欄に反映します。利用可否はブラウザの音声認識機能に依存します。",
  "speech.apiFooter":
    "録音後、停止ボタンで文字起こしを開始します。録音は指定した接続先へ送信されます。",
  "speech.meter": "マイク入力音量",
  "speech.noMeter": "音量表示を利用できません",
  "speech.level": "入力音量",
  "speech.noLevel": "音量表示なし",
  "speech.listening": "聞き取り中",
  "speech.starting": "マイクを準備中",
  "speech.preparing": "音声データを準備中",
  "speech.transcribing": "文字起こしを解析中",
  "speech.recordingAndSending": "録音中・変換リクエスト送信中",
  "speech.sendingWhileRecording": "直前の音声を送信中です（マイクは継続）。",
  "speech.endPhraseHint": "終了するには「{phrase}」と話します。",
  "speech.replacementSpoken": "発話",
  "speech.replacementResult": "置換後",
  "speech.replacementSpokenPlaceholder": "例：日記書いて",
  "speech.replacementRemove": "置換ルールを削除",
  "speech.replacementAdd": "ルールを追加",
  "speech.replacementHelp":
    "発話ごとに1行で登録します。長い語句のルールから優先して置換します。",
  "speech.liveHint": "話すと入力欄に反映されます。停止ボタンで終了。",
  "speech.recordHint": "停止ボタンで録音を終了し、解析を開始します。",
  "speech.cancelHint": "停止ボタンでキャンセル",
  "speech.retainHint": "停止ボタンで解析をキャンセル（録音は保持）",
  "speech.waiting":
    "サーバーの応答を待っています。処理時間は録音の長さやモデルによって変わります。",
  "speech.empty": "音声を認識できませんでした。もう一度録音してください。",
  "speech.retainedLimit":
    "保持中の録音が5分に達しています。「保持中の録音を変換」を押してください。",
  "speech.noRecording": "この環境はマイク録音に対応していません。",
  "speech.sizeLimit":
    "録音サイズの上限に達しました。短く録音し直してください。",
  "speech.recordError":
    "マイク録音に失敗しました。マイクの接続と権限を確認してください。",
  "speech.noSilence":
    "無音検出を利用できません。停止ボタンで録音を終了してください。",
  "speech.noBrowser":
    "この環境は音声認識（SpeechRecognition）に対応していません。",
  "speech.denied":
    "マイクの使用が許可されていません。アプリ／OSのマイク権限を確認してください。",
  "speech.serviceDenied": "この環境では音声認識サービスを利用できません。",
  "speech.captureError":
    "マイクを利用できません。接続と設定を確認してください。",
  "speech.networkError": "音声認識サービスに接続できません。",
  "speech.noSpeech": "音声を検出できませんでした。マイクボタンで再開できます。",
  "speech.adding": "追加録音中です。まとめて文字起こしします。",
  "speech.addHint":
    "「保持中の録音を変換」で再送できます。新しく録音を始めると保持中の録音は破棄されます。",
  "speech.retainedHelp":
    "成功後に録音を自動で消去します。再変換は保持音声を再送するため、API利用量が増える場合があります。",
  "speech.retry": "保持中の録音を変換",
  "speech.cancelLabel": "停止（解析をキャンセル）",
  "speech.stopLabel": "停止（聞き取りを終了）",
  "speech.stopListening": "聞き取りを停止",
  "speech.unsupported": "音声入力非対応（クリックで詳細）",
  "speech.micChecked": "マイクを確認しました",
  "speech.sharedSettings": "現在の{service}の設定を使用",
  "speech.or": "または",
  "speech.key": "キー",
  "speech.elapsed": "経過時間 {seconds}秒",
  "speech.retainedCount": "録音{count}件を保持しています。",
  "speech.autoStopHint":
    "約{seconds}秒の無音で区切って文字起こしします（マイクは継続）。",
  "speech.recognitionError": "音声認識",
  "speech.startError": "音声認識を開始できません",
  "speech.recordStartError": "録音を開始できません",
  "speech.live": "リアルタイム文字起こし",
  "speech.liveProviderHint": "OpenAI / Gemini / Vertex AI",
  "speech.questionCommand": "疑問符コマンド",
  "speech.newlineCommand": "改行コマンド",
  "speech.exclamationCommand": "感嘆符コマンド",
  "speech.readAloud": "読み上げ",
  "speech.autoReadAloud": "返信を自動で読み上げる",
  "speech.autoReadAloudHelp":
    "AIの返信が完了すると、端末の音声で読み上げます。返信は短く、読み上げやすい内容になります。",
  "speech.readAloudRate": "読み上げスピード",
  "speech.readAloudRateHelp": "読み上げる速さを調整します。1.0× が標準です。",
  "speech.readAloudChip": "読み上げ中",
  "speech.readAloudChipOff": "読み上げをオフ",
  "speech.voiceMode": "音声モード",
  "speech.voiceModeHelp": "返信後にマイクを自動でオンにします",
  "speech.voiceModeEnd": "自動でマイクをオンにしない",

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
  "topbar.newTimeline": "タイムラインに投稿",
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

  "mcp.approvals": "ツール実行の承認",
  "mcp.autoApprove": "常に承認（確認を省略）",
  "mcp.autoApproveHint":
    "このサーバーのツール実行をすべて確認なしで許可します。",
  "mcp.allowedTools": "許可済みツール",
  "mcp.allowedToolsHint":
    "「常に許可」したツールは確認なしで実行されます。削除すると再度確認されます。",
  "mcp.allowedToolsEmpty": "許可済みのツールはありません。",
  "mcp.removeTool": "削除",
  "mcp.approval.title": "MCPツール実行の承認",
  "mcp.approval.deny": "拒否",
  "mcp.approval.once": "今回だけ許可",
  "mcp.approval.always": "このツールを常に許可",

  "history.title": "履歴",
  "history.checkpointsSuffix": "件（メモリ履歴と永続ファイル履歴）",
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
  "history.fileVersion": "永続ファイル履歴",
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

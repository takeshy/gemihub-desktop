---
type: Product Feature
title: AI Chat
description: 設定したAI provider、ローカル知識、Skills、MCPを組み合わせて会話する任意機能。
tags: [ai, chat, assistant, optional]
timestamp: 2026-07-20T00:00:00+09:00
---

AI Chatは任意機能です。`Settings > AI features > Use AI features`
を有効にしたときだけChat
viewとAI関連設定が表示されます。無効にしてもドキュメント閲覧・編集、Dashboard、メモなどの基本機能は利用できます。

# Chatで組み合わせられる機能

「この回答をメモして」「要点を記録して」のように明示的に依頼すると、Chatは`append_timeline`
application
toolを使って回答または自己完結した要約をWorkspaceの標準Timelineへ追記します。同じChat経路を使うDiscord
Botでも利用できます。

「今日なにをやった？」や特定日の活動を尋ねると、Chatは`read_timeline`で該当日の標準Timelineを確認してから回答します。Timelineの読み書きtoolは一般のfile
tool設定とは独立して利用できます。

- OpenAI互換、Gemini、Vertex AI、Anthropic、Local CLI
- `@file` と選択範囲の右クリックメニューによる文脈追加
- Local RAGとOKF knowledge source
- provider nativeのWeb Search
- Agent Skills、Slash commands、Workflow tools
- HTTP/stdio MCP serversとMCP Apps
- 確認付きのローカルファイル操作

会話はsessionとして保存され、providerから返るusageも表示できます。履歴はローカルに保存され、`Settings > Encryption`
で暗号化可能です。AIへ送信される内容は、選択したprovider、添付、active
knowledge、toolsによって変わるため、機密情報を含める前に設定を確認してください。

生成中は送信buttonがStopに変わり、API streamまたはLocal CLI
processをキャンセルできます。停止時点までに受信済みの本文やthinkingはsessionへ残ります。

# 音声入力（試用）

まずOS標準の音声入力も試してください。環境や話し方によっては、より高い精度で認識できる可能性があります。
Chatの入力欄をクリックして、Windowsでは`Win + H`、Macでは`Fn + D`またはマイクキーで開始します。
Macのキー操作はOS・設定によって異なるため、「システム設定 → キーボード → 音声入力」で確認してください。
OS入力にはアプリのAPIキー設定は不要です。アプリ内の送信合図は適用されないため、入力内容を確認して送信ボタンを押します。
操作の詳細は[Microsoftの案内](https://support.microsoft.com/en-us/accessibility/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc)と[Appleのショートカット案内](https://support.apple.com/en-us/102650)を参照してください。

Chat入力欄のマイクボタンで日本語の音声入力を開始します。認識途中の文字も入力欄へ反映され、開始前の下書きに追記されます。
ブラウザ認識では、発話の末尾に「over」または「オーバー」を付けると、認識確定後にその合図を除いて送信します。
送信前に見直す場合はマイクボタンで停止してください。手入力、送信、チャット切替でも停止します。

アプリ内のWebViewが提供する`SpeechRecognition`または`webkitSpeechRecognition`を使用します。
API非対応や認識サービス・マイク権限のエラーは入力欄付近に表示されます。認識が終了したらマイクボタンで再開できます。

`Settings > 音声入力`で、従来のブラウザ認識（初期値）・OpenAI互換・ライブ文字起こしを切り替えられます。OpenAI互換の「サービス」でOpenAI、whisper.cpp、その他を選べます。OpenAIを選ぶとBase URLに`https://api.openai.com/v1`、Modelに`whisper-1`が自動入力されます。音声入力の設定はAI設定から独立しています。
マイクの確認と、無音データを使った接続テストもここで実行できます。
「送信の合図」はブラウザ認識・OpenAI互換・whisper.cpp・ライブ文字起こしで利用できます。初期値は`over, オーバー`です。任意の言葉をカンマ区切りで設定でき、空欄なら自動送信しません。
下書きが空のまま送信の合図だけを言った場合は、送信せずに聞き取りを終了します。音声モードも終了し、次の返信後にマイクは自動で開きません。
「疑問符」「改行」「感嘆符」の音声コマンドは、発話の末尾にあればそれぞれ`?`・改行・`!`へ置き換えます。置換ルールは`日記書いて => /daily`のように1行1件で登録し、認識確定後の文へ長い語句から順に適用します。
「音声ボタンのショートカット」の入力欄をクリックして、`Ctrl + Shift + M`など割り当てたいキーを押すと保存されます。
アプリがアクティブなら入力欄以外にフォーカスがあっても使え、音声ボタンと同じく開始・停止・解析キャンセルを切り替えます。Chatが閉じている場合は開きます。設定画面では無効です。初期値は未割り当てです。「割り当てを解除」で無効にできます。
OpenAI互換STTでは、Base URL、任意のAPI Key、Model、Languageを設定します。
「ライブ文字起こし」はOpenAI、Gemini API、Vertex AIへ音声をストリーミングし、話している途中の結果を下書きへ反映します。停止を待たずに文字が出るため、長い口述に向いています。接続先はこの3つのみで、whisper.cppやカスタムURLは選べません。whisper.cppやカスタム接続から切り替えたときは、その接続用のAPIキーをOpenAIへ引き継がずに空欄へ戻します。

| 接続先の例 | Base URL | Model | API Key |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `whisper-1` | OpenAIのキー |
| ローカル互換サーバー | `http://127.0.0.1:8080/v1` | `whisper` | 認証不要なら空欄 |

whisper.cpp標準サーバーの場合は方式に「OpenAI互換」、サービスに「whisper.cpp」、Base URLに`http://127.0.0.1:8080`を指定してください。
この方式では`/inference`へ接続し、サーバーで読み込み済みのモデルを使います。Modelの入力は不要です。Languageは`auto`も明示的に送信します。

OpenAI互換方式のURLとModelはサーバーの設定に合わせてください。Base URLに`/audio/transcriptions`を付けてリクエストします。
Languageは`auto`または空欄なら自動判定、`ja`や`en`ならその言語を指定します。キーが空欄の場合、Authorizationヘッダーは送りません。

OpenAI互換STTとwhisper.cppではマイクボタンで録音を開始し、再クリックで停止して文字起こしします（最大5分）。
「無音で自動停止」は初期値が3秒です。話し始めた後、設定した時間の無音が続くと、その時点までの録音で文字起こしします。1〜10秒またはオフを選べます。
話し始める前や短いクリック音だけでは自動停止しません。周囲の音によって停止タイミングは変わります。無音検出を利用できない環境では、その旨を表示し、停止ボタンで終了できます。
16 kHz・モノラルのWAVを指定したサーバーへ送信し、返ってきたテキストを下書きへ追記します。録音はファイルとして保存しません。
発話を検出できなかった録音は送信しません。「音声を検出できませんでした」と表示し、APIへは何も送らずに終了します（無音の録音から実在しない文が返るのを避けるためです）。この判定は「無音で自動停止」をオフにしていても働きます。
録音方式では無音での自動停止または停止ボタンの後に文字起こしし、末尾に送信の合図があれば、合図を除いて送信します。合図がなければ下書きに残します。リアルタイムの途中結果はありません。
聞き取り中は入力音量に反応するイコライザー、解析中は動くインジケーターと経過時間を表示します。音量取得に対応しない環境では「音量表示なし」と表示します。
手入力・チャット切替・送信で録音や結果の反映を取り消します。文字起こし中は「停止」ボタンでキャンセルできますが、既にサーバーへ届いたリクエストは完了する場合があります。
文字起こしをキャンセルした録音は同じChat内で保持されます。「保持中の録音を変換」で追加録音なしで再変換できます。新しく録音を始めると、保持中の録音は破棄します（失敗の原因かもしれない録音を引きずらないためです）。変換成功後も保持音声を自動で消去します。
保持音声はメモリ内のみで、Chat切替・認識方式の切替・画面を閉じると消去されます。保持分を含めて録音は合計5分までです。再変換では保持音声を再送するため、API利用量が増える場合があります。
保持中の録音の案内とエラー表示は、右端の×でその場で閉じられます。×は保持中の録音も破棄します。
ブラウザ認識と録音の対応可否は、それぞれ実行環境のWebViewとマイク権限に依存します。

# 読み上げと音声モード

「回答を自動で読み上げる」を有効にすると、返信の完了後に端末の音声で読み上げます。読み上げが有効な間、返信は見出しや箇条書きを避けた、短く読み上げやすい文体になります。
設定の`音声入力 > 読み上げ`のほか、Chat入力欄のツールボタン（Workspace／MCP）のメニューからも切り替えられます。有効時は読み上げ速度（0.5〜5.0倍）も同じメニューで変更できます。
読み上げ中は入力欄の上にチップを表示し、その×で自動読み上げをオフにします。

マイクボタンで音声入力を始めると音声モードに入り、返信が終わるたびにマイクを自動で開き直します。読み上げが有効な場合は読み上げの終了を待ってから開きます。
マイクの横のチップの×は、この「返信後に自動でマイクをオンにする」動作だけを止めます。進行中の録音や読み上げはそのまま続きます。
マイクボタンで停止したときや、下書きが空のまま送信の合図だけを言ったときも音声モードを終了します。Chatのsessionを切り替えたときも解除します。

# Web Search

入力欄の **Web** toggleを有効にすると、provider nativeのWeb
Searchを使用します。Local RAGの選択とは独立しており、Web Search中もWorkspace
file tools、custom tools、設定済みMCP
toolsを併用できます。検索結果にcitationが返るproviderでは、回答末尾へSources
linkを追加します。

GeminiとVertex
AIでは利用できます。OpenAI互換providerではOpenAIまたはxAIの公式endpoint、AnthropicではAnthropicの公式endpointが必要です。Local
CLI、非対応のcustom endpoint、image/video生成modelではtoggleが無効になります。

# 履歴の保存場所

Chat historyはWorkspace内の隠しstate
fileとして保存されます。session専用の別保存先はなく、Workflow
logなどの状態と同じWorkspaceにまとまります。

# Session単位の設定

chat sessionごとにactiveなSkillsとOKF bundleを別々に保持できるため、session
Aで有効にしたSkillがsession
Bには影響しません。usage表示にはinput/output/thinking/total/cached/tool
useの各token数が個別に含まれ、合計だけでなくどこにtokenが使われたかを確認できます。Chat
historyを暗号化している場合、キャッシュされたパスワードが見つからないとhistory読み込み時にパスワード入力を求められます。

アプリを起動したとき、保存済みsessionがある場合は新しい空のsessionを先頭に作ります。すでに空の
`New chat`
だけがある場合は重複して作りません。過去のsessionは削除されず、session一覧から開けます。

# 関連機能

[AI providerとLocal CLI](/features/ai-providers-cli.md)、[暗号化とSecret Manager](/features/encryption-secret-manager.md)、[Chatのコンテキストとファイル操作](/features/chat-context-file-tools.md)、[Agent SkillsとSlash commands](/features/agent-skills-commands.md)。

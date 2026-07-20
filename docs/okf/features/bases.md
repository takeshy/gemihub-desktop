---
type: Product Feature
title: Base
description: "`.base` 定義を使ってMarkdown群を絞り込み、計算し、table・cards・listとして表示する機能。"
tags: [base, database, query, frontmatter]
timestamp: 2026-07-20T00:00:00+09:00
---

Baseは、Workspace内のMarkdownファイルとfrontmatterをデータ行として扱うquery/view機能です。`.base` ファイルにsource、filter、formula、property、sort、summary、viewを定義し、DashboardのBase widgetまたはBaseファイルとして表示します。

# 表示と編集

* view形式: `table`、`cards`、`list`
* filterとsortで対象行と順序を制御
* formulaで既存propertyやfile metadataから計算値を生成
* groupとsummaryで分類・集計
* Base config editorで定義を編集
* cards viewでpropertyまたはformula fieldをcover imageとして表示

cards viewの `Card image` には、Workspace内の画像path、image/link/file/url/string値、data URL、HTTP(S) URLを含むfieldを指定できます。`Image fit` はCoverまたはContainを選び、`Image ratio` と `Card size` でカード表示を調整します。画像を使わない場合は `Card image: None` にします。

Baseは元のMarkdownファイルを集約して見せる機能で、独立したデータベースへ内容をコピーするものではありません。GemiHub互換形式を読み書きし、`x-`で始まる拡張keyやview/formula内の未知の値は可能な限り保持します。ただしroot直下に定義済み以外・`x-`以外の未知keyがあると、設定全体の読み込みが失敗するので注意してください。

# 対象ファイルの絞り込み

Kanbanと異なり、Baseには対象folderを直接指定する設定はありません。行は常にWorkspace全体のファイル一覧から集められるため、特定folderだけを対象にしたい場合は`file.folder`や`file.path`を使ったfilterで絞り込みます。formula・filterから参照できる`file.*`には`name`、`path`、`folder`、`ext`、`size`、`ctime`、`mtime`、`tags`、`outgoingLinks`、`backlinks`、`embeds`、`properties`などがあり、wiki linkのgraph情報も含まれます。

`file.ctime`（作成日時）、`file.mtime`（更新日時）、日付形式のfrontmatter propertyをfilterに選ぶと、値欄が日付ピッカーになります。たとえば「2026-07-01以降に作成されたファイル」は `file.ctime` / `is on or after` / `2026-07-01` を選択します。保存される式は `file.ctime >= date("2026-07-01")` です。

# うまく表示されないとき

* Baseファイルが開けない・空になる: root直下にtypoや未対応のkeyがないか確認する。1箇所の誤りでファイル全体の解析が失敗します。
* 想定外のファイルが行に出る: folder指定がないため、意図しないファイルまで対象になっていないかfilterを見直す。
* `view.limit`を設定した場合は1以上の整数である必要があります。
* 安全のため、formula/filter expressionは最大65,536文字・括弧128階層です。regexpは最大256文字で、backreference、lookaround、無制限または過度に複雑なquantifierを拒否します。

# 関連機能

[Dashboard](/features/dashboards.md)、[Kanban](/features/kanban.md)（folder指定の有無が対照的です）

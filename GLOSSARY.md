# Todo

Todo管理とMCP公開を行うコンテキスト。

## Language

**Ping**:
MCP接続確認のための最小ツール。
_Avoid_: healthcheck, echo

**Whoami**:
MCP利用者の利用者情報を返すツール。
_Avoid_: who_am_i, me

**利用者**:
GitHubアカウントで認証されたTodoの使用者。
_Avoid_: ユーザー, アカウント

**MCP利用者**:
MCPクライアント経由でTodoを利用する第三者。
_Avoid_: ユーザー

**Todo**:
利用者が管理する1件のやること。`title`と`done`と任意の`期限`と任意の`フォーカス日`を持つ。
_Avoid_: Task

**期限**:
Todoに任意で付く日付。`YYYY-MM-DD`形式。
_Avoid_: 締切

**フォーカス日**:
その日に集中するために今日の予定に入れた日。未来日は取らず今日と過去のみ。`期限`とは独立。
_Avoid_: 予定日, 対象日, 締切

**繰り返し**:
`Todo`に付く繰り返し規則。`{unit: 日|週|月|年, interval: N}`を持ち、`期限`を起点に完了時に次回`期限`の`Todo`を1件自動生成する。
_Avoid_: リピート, repeat

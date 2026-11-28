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
利用者が管理する1件のやること。`title`と`done`と任意の`期限`を持つ。
_Avoid_: Task

**期限**:
Todoに任意で付く日付。`YYYY-MM-DD`形式。
_Avoid_: 締切

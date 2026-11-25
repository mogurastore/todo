# Todo MCP

MCP経由でのみ操作する個人用Todoストア。単一Worker上でD1+drizzle、GitHubログインで動く。

## Language

**User**:
リストとTodoを所有する人1人。全データは `users.id` にぶら下がる。
_Avoid_: Account

**Identity**:
Userに紐づく外部IdPのアカウント対応付け1件。`(provider, providerUserId)` で一意。最初は `github`。
_Avoid_: Account, Login, Credential

**List**:
Userが所有するTodoの入れ物。当面はデフォルトの1件のみ。MCPでは読み取り専用。
_Avoid_: Project, Folder

**Todo**:
1つのListに属する作業1件。タイトルと完了状態のみ持つ。
_Avoid_: Task

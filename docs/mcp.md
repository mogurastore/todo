# MCP (Remote, Streamable HTTP, OAuth必須)

OAuth単一Worker構成(ADR-0003)。`/mcp`は無認可で401+発見メタデータを返し、手貼りBearerは不可。

## 接続手順

1. MCPクライアントに `https://<host>/mcp` を登録する
2. 401の `resource_metadata` から `/.well-known/oauth-authorization-server` を辿り、DCR登録→`/authorize`でGitHub承認する
3. 発行トークンで `/mcp` を叩き、`ping`/`whoami` が通ることを確認する

## 載せ方

- `OAuthProvider({ apiRoute: '/mcp', ... })` で `/mcp` を保護し、残りはHono(`defaultHandler`)に委譲する
- 認可UIは `GET /authorize`(consent)→`POST /authorize`(GitHubへ)→`GET /oauth/callback`(complete)の3点
- MCPハンドラはリクエスト単位に作り、`ctx.props`(login/id)を渡す:
- `app.all('/mcp')` 直載せ・手貼りBearer判定は撤去済み。残したら二重経路になる

## テストの注意

- 外側経由は `worker.fetch(new Request('http://localhost/...'), { OAUTH_KV })` を使う。KVモックは `get(key, {type:'json'})` をJSON解釈すること
- `Accept: application/json, text/event-stream` を付ける。応答はSSEなのでテキストにツール名が含まれることをassertする
- 旧Bearer(JWT使い回し)は401になることをassertする(`test/auth.test.ts`)

## 開発サーバと確認コマンド

- 本番相当の確認は `pnpm exec wrangler dev --port 8787`
- Inspector等は `pnpm dlx` を使う:

```sh
pnpm dlx @modelcontextprotocol/inspector
# Transport: Streamable HTTP / URL: http://localhost:8787/mcp (OAuthフローあり)
```

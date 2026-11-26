# MCP (Remote, Streamable HTTP)

## 載せ方レシピ

- baseは素の `new Hono()` のままにする。`createMcpHonoApp()` をbase全体に適用しないこと。Host検証ミドルウェアが全ルートにかかり、公開Worker上で既存ルートが403になる。
- MCPハンドラはリクエスト単位のファクトリで作る:

```tsx
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

const mcpHandler = createMcpHandler(() => createMcpServer())

app.all('/mcp', (c: Context) => {
  const parsed = c.req.raw.clone().json().catch(() => undefined)
  return parsed.then((parsedBody) => mcpHandler.fetch(c.req.raw, { parsedBody }))
})
```

`clone()` で読むのは元のストリームを消費しないため。`parsedBody` を渡すのは公式Hono統合と同じ流儀。

## テストの注意

- `app.request('/mcp', ...)` は相対パスでよい。Hostヘッダは不要（baseにHost検証が無いため）。
- `Accept: application/json, text/event-stream` を付ける。応答はSSEの `message` イベントなのでテキストにツール名が含まれることをassertする。

## 開発サーバと確認コマンド

- 本番相当の確認は `pnpm exec wrangler dev --port 8787`。
- `pnpm dev` でも `/mcp` は動くが、viteは `[::1]` のみで待つためURLは `http://localhost:<port>` を使うこと（`127.0.0.1` は接続拒否になる）。
- Inspector等は `npx` ではなく `pnpm dlx` を使う:

```sh
pnpm dlx @modelcontextprotocol/inspector
# Transport: Streamable HTTP / URL: http://localhost:8787/mcp
```

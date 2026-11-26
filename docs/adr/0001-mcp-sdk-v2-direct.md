# MCPはMcpAgentではなく公式SDK v2直載せにする

公式の `McpAgent` はdeprecated・feature-frozenのため、新規のMCP対応は `@modelcontextprotocol/server` の `createMcpHandler` をHonoの `/mcp` ルートに直接載せる。Hono中心の構成と状態をD1/KV側に寄せる方針に素直で、公開Worker上で不要なHost検証を持ち込まない。

## Considered Options

- `agents` パッケージの `McpAgent`: deprecatedのため不採用。既存サーバは動き続けるが新規には選ばない。
- `@modelcontextprotocol/hono` の `createMcpHonoApp` をapp全体のbaseにする: Host/DNSリバインディング保護が全ルートにかかり、公開Workerで既存ルートが403になるため不採用。

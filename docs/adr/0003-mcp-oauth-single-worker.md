# MCP OAuthは単一Worker結合型で導入する

Todo専用MCPを一般公開し自動連携が必要になったため、`@cloudflare/workers-oauth-provider`を単一Worker結合型で導入する。0002の手貼りBearerは切ってOAuthに一本化し、KV (`OAUTH_KV`) を持つ。

## Considered Options

- 分割型 (認可サーバとリソースサーバを分離): MCP複数化・WAF分離が必要になったら移行する。現段階ではTodo単独・厳密化不要のため不採用。
- 手貼りBearer維持: 自動発見フローに入れないため不採用。

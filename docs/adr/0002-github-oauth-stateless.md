# GitHub OAuthはステートレスJWT Cookie + MCPはBearerで使い回す

> Superseded by ADR-0003。`/mcp` のBearer使い回しは撤去し、OAuthに一本化した。

素のGitHub OAuth Authorization Codeフローで `/auth/login` → `/auth/callback` を行い、利用者情報 (login/id/avatar) を `SESSION_SECRET` 署名のJWTとしてHttpOnly Cookieに入れる。D1/KVは持たず、better-authは導入しない。`/mcp` は同一JWTを `Authorization: Bearer` でも受け付け、人用ページで発行したトークンをMCPクライアントに貼る運用にする。

## Considered Options

- better-auth: ユーザー/セッション管理が本格化するまで過剰で、DB前提になるため不採用。D1導入後に再検討する。
- `@cloudflare/workers-oauth-provider` によるMCP OAuth完全対応: 工数が大きく、現段階の利用者規模には不要なため不採用。自動連携が必要になったら検討する。
- サーバー側セッション (KV/D1): ステートレスで足りる間は運用コストを避けるため不採用。

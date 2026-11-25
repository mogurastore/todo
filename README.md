```txt
npm install
npm run dev
```

```txt
npm run deploy
```

## Inspectorでの動作確認

開発用バイパスは作っていないため、確認時は毎回GitHubログインが必要。

### 1. GitHub OAuth Appを作る

1. GitHub Settings → Developer settings → OAuth Apps → New OAuth App
2. Authorization callback URL: `http://localhost:8787/callback`（本番は `https://<worker>/callback`）
3. 発行された Client ID / Client secret を控える

### 2. D1を作る（初回のみ）

```txt
pnpm dlx wrangler d1 create todo
```

表示された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に設定する。
本番ドメインを使う場合は `src/index.tsx` の `resourceMetadata` も本番URLに合わせる。

### 3. secrets/varsを設定する

```txt
cp .dev.vars.example .dev.vars   # 中身を実値に書き換える
pnpm dlx wrangler secret put GITHUB_CLIENT_ID      # 本番用
pnpm dlx wrangler secret put GITHUB_CLIENT_SECRET  # 本番用
```

### 4. 起動してInspectorで確認する

```txt
pnpm dev
pnpm dlx @modelcontextprotocol/inspector
```

Inspectorで Transport Type に Streamable HTTP を選び、URL に
`http://localhost:8787/mcp` を入れて Connect。ブラウザのGitHub認可を済ませたら
`tools/list` で6ツールが見えることを確認し、以下を順に叩く。

- [ ] `list_lists` → Inbox が1件返る
- [ ] `create_todo {title}` → Inboxに作られる
- [ ] `list_todos {}` → 作ったTodoが見える
- [ ] `list_todos {done: true/false}` → フィルタが効く
- [ ] `get_todo {id}` → 1件取れる
- [ ] `update_todo {id, done: true}` → 反映される
- [ ] `delete_todo {id}` → 消える
- [ ] 存在しないidの `get_todo` → エラー（存在を隠す）になる

## テスト

```txt
pnpm test        # 全テストを実行 (Workers ランタイム上で動作)
pnpm test:watch  # ウォッチモード
pnpm typecheck   # 型チェック
```

- `test/unit.test.ts`: Hono アプリの API テスト (`app.request()`)
- `test/integration.test.ts`: Workers ランタイム上での統合テスト (`cloudflare:workers` の `exports` 経由)

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

```txt
npm install
npm run dev
```

```txt
npm run deploy
```

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

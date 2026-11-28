# CODING_STANDARDS.md

レビュー時に読む判断コール集。機械的にできることはリンタ・CIに寄せ、ここには判定が必要なものだけ置く。

## テストの期待値は独立した算出で求める

期待値の算出に実装ヘルパーを流用しない。既知リテラルか、実装とは別経路の算出を使う。実装と同じ関数で期待値を組み立てるとトートロジーになり、テストが実装の誤りを検出できなくなる。

```ts
// 良い例: JSTはDSTなしUTC+9という独立知識で期待値を求める
function jstTodayViaUtc(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
```

```ts
// 悪い例: 実装と同じヘルパーで期待値を組み立てる
import { getJstTodayString } from '../src/todo'
const expected = getJstTodayString()
```

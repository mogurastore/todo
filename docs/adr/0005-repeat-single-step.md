# 繰り返しは完了時次回生成・単発前進とする

`繰り返し`は`Todo`が持つ`{unit: day|week|month|year, interval: 1〜99}`規則とし、`done: false→true`遷移時に前回`期限`＋1回分のカレンダー加算で次回`Todo`を1件生成する。延滞追いつきループはせず、月末は丸める。

## Considered Options

- 単一`Todo`復活方式: 完了履歴が残らず、履歴表示と存在を隠す設計に合わないため不採用。
- 延滞分追いつき生成: 複数件一気生成は驚きが大きく、MCPのみの最小実装に合わないため不採用。1回前進に絞る。
- 曜日指定・crontab式: 今回不要のため不採用。`N×日/週/月/年`に絞る。

## Consequences

`repeat`ありには`期限`必須（期限なし指定・期限クリアはエラー）。新`Todo`は`done=false・focusDate=null・同じtitle・同じrepeat`。`update`の`repeat`省略は維持、`null`は解除。範囲は`TodoStore + MCP`のみでWeb UIは対象外。

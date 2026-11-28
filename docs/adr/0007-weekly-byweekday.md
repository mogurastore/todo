# 週の曜日指定はRepeat内配列＋週ブロック前進とする

`繰り返し`の`unit: week`に限り`byWeekday: 0=日〜6=土の1〜7件配列（ソート・重複除去済み）`を許す。次回`期限`は`期限`より後で`(候補週−期限週) % interval == 0`（日曜始まり）を満たす最初の該当曜日とし、単発前進・冪等（ADR-0005/0006）を維持する。`byWeekday`省略時は従来通り`期限+7×interval`。

## Considered Options

- bitmask整数（`10`で月水）: SQLでJSON関数不要になるが、MCP表示が不透明でテスト期待値が読みにくく、MCP配列⇄DBマスクの変換層が増えるため不採用。
- 単一曜日専用カラム: 複数をカバーできず拡張が効かないため不採用。単一は1件配列で表す。
- 延滞追いつき複数生成: 驚きが大きく最小実装に合わないため不採用。直後1件に絞る。
- 別テーブル（`todo_weekdays`）: 曜日でのSQL絞り込みが不要な間は過剰のため不採用。必要になれば`json_each`＋生成カラムで延命する。

## Consequences

`RepeatRule`に`byWeekday?`追加。MCP入力層で`week`以外付与・空配列・範囲外を弾き、storeは正規化のみでdumb維持。永続化は`repeat_unit / repeat_interval / repeat_weekdays(TEXT JSON配列)`の3カラム方針（D1は`TEXT+json_each/json_extract`で扱う）。Web UIは対象外。

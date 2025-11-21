# TODO

## 未完了

### 増分取得機能

- [x] cards-data 増分取得
  - 発売日順（sort=21: 新しい順）でソート
  - 既存TSVからcardIdセットを読み込み
  - 既存cardIdが見つかったら中断
  - 新規カードを既存データにマージ
  - fetch-incremental.ts として実装

- [x] faq 増分取得
  - 更新日時順（sort=2）でソート
  - 既存TSVからfaqIdセットを読み込み
  - 既存faqIdが見つかったら中断
  - 新規FAQを既存データにマージ
  - fetch-incremental.ts として実装

- [x] cards-detail 増分取得
  - 新規cardIdに対してのみ補足情報を取得
  - fetch-incremental.ts として実装

### ドキュメント

- [x] READMEのCookie/セッション説明を改善
  - なぜCookieが必要なのかを明記
  - セッション維持の仕組みを説明（検索ページアクセス → セッションCookie取得 → 検索実行）
  - cookies.txtの正確な用途を記載
  - 増分取得機能のドキュメントを追加

## 完了

- [x] package-lock.jsonをgitignoreから削除
- [x] parse-to-tsv.tsの現状把握
- [x] _ref/ygo-deckから参照元ソースコードを発見
- [x] biko情報（備考情報）の追加
  - セレクタ: `.box_card_text.biko`
  - 新しいカラムとして備考情報を取得
  - `isNotLegalForOfficial`フラグカラムを追加
  - 2075件の公式使用不可カードを検出

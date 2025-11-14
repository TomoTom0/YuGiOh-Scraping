# FAQ詳細情報取得スクリプト

## 概要

FAQ一覧からFAQ詳細情報（質問・回答・更新日）を取得します。

## ディレクトリ構造

```
faq/
├── scripts/          スクリプトファイル
│   ├── fetch-faqid-list.ts       FAQ ID一覧取得
│   ├── fetch-faq-from-list.ts    FAQ詳細取得（メイン）
│   ├── fetch-faq-details-all.ts  カード別FAQ取得（別アプローチ）
│   └── fetch-faq-details-test.ts テスト用
├── input/           入力データ
│   └── cards-all.tsv         カード一覧（参照用）
├── output/          FAQ ID一覧と最終出力
│   ├── faqid-all.tsv         FAQ ID一覧（12,579件）✅ 完了
│   └── faq-all.tsv           全FAQ詳細（未完成）
├── config/          設定ファイル
│   ├── cookies.txt           認証用Cookie
│   └── cookies-faq.txt       FAQ専用Cookie
├── temp/            中間ファイル（自動保存）
│   ├── faq-all-temp-1000.tsv
│   ├── faq-all-temp-2000.tsv
│   ├── faq-all-temp-3000.tsv
│   └── faq-all-temp-4000.tsv
├── test/            テストデータ
└── docs/            ドキュメント
```

## 使用方法

### 新規実行

```bash
cd scripts
npx tsx fetch-faq-from-list.ts
```

### 再開実行

中断された処理を再開する場合は `--start-from=<インデックス>` オプションを使用します。

```bash
# 4001番目のFAQから再開（インデックスは0始まりなので4000を指定）
cd scripts
npx tsx fetch-faq-from-list.ts --start-from=4000
```

**現在の状況:**
- 処理済み: 3,999/12,578 FAQ（31.8%）
- 再開コマンド: `npx tsx fetch-faq-from-list.ts --start-from=4000`
- 残り時間: 約143分（2時間23分）

## スクリプトの動作

1. `output/faqid-all.tsv` からFAQ ID一覧を読み込み
2. 各FAQの詳細情報を取得（1秒間隔）
3. 1000件ごとに中間ファイルを `temp/` に自動保存
4. 完了後、`output/faq-all.tsv` に最終結果を出力

## 2つのアプローチ

### アプローチA: カード別FAQ取得
- スクリプト: `fetch-faq-details-all.ts`
- 各カードページからFAQを取得
- 進捗: 約4,000 FAQ取得で中断

### アプローチB: FAQ一覧から一括取得（推奨）
- スクリプト: `fetch-faqid-list.ts` + `fetch-faq-from-list.ts`
- FAQ ID一覧から直接FAQ詳細を取得
- FAQ ID一覧は既に取得済み（12,579件）
- こちらのアプローチを推奨

## 注意事項

- サーバー負荷を考慮し、1秒間隔でリクエスト
- 中断された場合でも中間ファイルから再開可能
- `config/cookies.txt` が必要（認証用）

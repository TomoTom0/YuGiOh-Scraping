# カード補足情報取得スクリプト

## 概要

カードごとの補足情報（supplement情報とペンデュラムsupplement情報）を取得します。

## ディレクトリ構造

```
cards-detail/
├── scripts/          スクリプトファイル
│   ├── fetch-qa-all.ts       メインスクリプト（全カード補足情報取得）
│   ├── fetch-qa-batch.ts     バッチ処理用（テスト）
│   └── fetch-qa-to-tsv.ts    TSV変換用（テスト）
├── input/           入力データ
│   └── cards-all.tsv         カード一覧（13,754件）
├── config/          設定ファイル
│   └── cookies.txt           認証用Cookie
├── temp/            中間ファイル（自動保存）
│   ├── qa-all-temp-1000.tsv
│   ├── qa-all-temp-2000.tsv
│   └── ...
├── output/          最終出力
│   └── qa-all.tsv            全カード補足情報
├── test/            テストデータ
└── docs/            ドキュメント
```

## 使用方法

### 新規実行

```bash
cd scripts
npx tsx fetch-qa-all.ts
```

### 再開実行

中断された処理を再開する場合は `--start-from=<インデックス>` オプションを使用します。

```bash
# 6001番目のカードから再開（インデックスは0始まりなので6000を指定）
cd scripts
npx tsx fetch-qa-all.ts --start-from=6000
```

**現在の状況:**
- 処理済み: 6,000/13,754カード（43.6%）
- 再開コマンド: `npx tsx fetch-qa-all.ts --start-from=6000`
- 残り時間: 約129分（2時間10分）

## スクリプトの動作

1. `input/cards-all.tsv` からカードID一覧を読み込み
2. 各カードの補足情報を取得（1秒間隔）
3. 1000件ごとに中間ファイルを `temp/` に自動保存
4. 完了後、`output/qa-all.tsv` に最終結果を出力

## 注意事項

- サーバー負荷を考慮し、1秒間隔でリクエスト
- 中断された場合でも中間ファイルから再開可能
- `config/cookies.txt` が必要（認証用）

# 出力ディレクトリ構造の変更

**日付**: 2025-12-18
**種別**: 構造変更 (Breaking Change)

## 概要

出力ディレクトリ構造を簡素化し、全てのTSVファイルを`output/data/`ディレクトリに統一しました。

## 変更内容

### ディレクトリ構造

**変更前:**
```
output/
├── cards-data/
│   └── cards-all.tsv
├── cards-detail/
│   ├── qa-all.tsv
│   └── .temp/
└── faq/
    ├── faq-all.tsv
    └── .temp/
```

**変更後:**
```
output/
├── data/
│   ├── cards-all.tsv
│   ├── detail-all.tsv  (旧: qa-all.tsv)
│   └── faq-all.tsv
└── .temp/
    ├── cards-detail/
    └── faq/
```

### ファイル名の変更

- `output/cards-detail/qa-all.tsv` → `output/data/detail-all.tsv`

### 一時ファイル配置の変更

- `output/cards-detail/.temp/` → `output/.temp/cards-detail/`
- `output/faq/.temp/` → `output/.temp/faq/`

## 影響を受けるファイル

### スクリプトファイル（7ファイル）

1. `src/cards-data/parse-to-tsv.ts`
2. `src/cards-data/fetch-incremental.ts`
3. `src/cards-detail/fetch-incremental.ts`
4. `src/cards-detail/fetch-qa-all.ts`
5. `src/faq/fetch-incremental.ts`
6. `src/faq/fetch-faqid-list.ts`
7. `src/faq/fetch-faq-from-list.ts`

### ドキュメントファイル

- `README.md`: プロジェクト構造、出力先パス、ディレクトリ構造図を更新

## 移行手順

既存のデータがある場合、以下のコマンドで新しい構造に移行できます:

```bash
# データディレクトリを作成
mkdir -p output/data

# ファイルを移動
mv output/cards-data/cards-all.tsv output/data/
mv output/cards-detail/qa-all.tsv output/data/detail-all.tsv
mv output/faq/faq-all.tsv output/data/

# 古いディレクトリを削除
rm -rf output/cards-data output/cards-detail output/faq
```

## 変更理由

1. **シンプル化**: 3つのサブディレクトリを1つに統一
2. **明確化**: `qa-all.tsv` → `detail-all.tsv` で内容をより明確に表現
3. **一貫性**: 一時ファイルを`output/.temp/`に集約

## 後方互換性

この変更は後方互換性がありません。既存のスクリプトやツールで出力ファイルのパスをハードコードしている場合は更新が必要です。

## テスト結果

- ✅ `bun run update:cards` で動作確認済み
- ✅ 既存データの読み込みが正常に動作
- ✅ 増分取得機能が正常に動作

## 関連コミット

この変更は以下のコミットで実装されました:
- 出力パスの更新
- ファイル移動
- ドキュメント更新

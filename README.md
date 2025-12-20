# 遊戯王カードデータベース スクレイピングプロジェクト

## 概要

遊戯王公式カードデータベース（https://www.db.yugioh-card.com/）から、カード情報とFAQ情報を取得するプロジェクトです。

**最終更新日**: 2025-11-21
**ステータス**: ✅ **全データ取得完了 + 増分取得機能追加**

---

## 📁 プロジェクト構造

```
ygo-scraping/
├── src/              スクリプト（✅ 完了）
│   ├── cards-data/
│   ├── cards-detail/
│   ├── faq/
│   └── update.ts     統合アップデートスクリプト
└── output/           出力データ（✅ 完了）
    ├── data/         全TSVファイル
    └── .temp/        一時ファイル（cards-data, cards-detail, faq）
```

---

## 📊 取得済みデータ

### データ配布

**最新データは[GitHub Releases](https://github.com/TomoTom0/YuGiOh-Scraping/releases)からダウンロードできます。**

- 更新頻度: 毎週金曜日 20:00 UTC（日本時間 土曜日 05:00）自動更新
- 形式: tar.gz圧縮されたTSVファイル
- 保持数: 最新3世代（古いものは自動削除）
- ダウンロード: `ygo-data-YYYY.MM.DD.tar.gz`

```bash
# ダウンロード例（最新版を自動取得）
# GitHub Releases の latest を使用すると、常に最新データをダウンロードできます
wget https://github.com/TomoTom0/YuGiOh-Scraping/releases/latest/download/ygo-data-2025.12.18.tar.gz -O ygo-data-latest.tar.gz
tar -xzf ygo-data-latest.tar.gz

# または、特定バージョンを指定する場合
# wget https://github.com/TomoTom0/YuGiOh-Scraping/releases/download/YYYY.MM.DD/ygo-data-YYYY.MM.DD.tar.gz
```

**注意**: 初回データは手動でアップロードする必要があります。自動更新は2回目以降（増分取得）で機能します。

### 1. cards-data/ - カード基本情報

**ステータス**: ✅ **完了**

カードの基本情報（名前、種族、属性、攻撃力、守備力、効果テキストなど）

- **出力**: `output/data/cards-all.tsv`
- **件数**: 13,754カード
- **サイズ**: 8.2MB
- **フォーマット**: TSV（タブ区切り）
- **スキーマ**: [docs/schema/cards-all.md](docs/schema/cards-all.md)

**カラム**:
```
cardType | name | nameModified | ruby | cardId | ciid | imgs | text | biko |
isNotLegalForOfficial | attribute | levelType | levelValue | race | monsterTypes |
atk | def | linkMarkers | pendulumScale | pendulumText | isExtraDeck |
spellEffectType | trapEffectType
```

詳細は[スキーマドキュメント](docs/schema/cards-all.md)を参照してください。

### 2. cards-detail/ - カード補足情報

**ステータス**: ✅ **完了**

各カードのルール補足情報とペンデュラム補足情報

- **出力**: `output/data/detail-all.tsv`
- **件数**: 13,753カード（ヘッダー除く）
- **サイズ**: 13MB
- **フォーマット**: TSV（タブ区切り）
- **スキーマ**: [docs/schema/detail-all.md](docs/schema/detail-all.md)

**カラム**:
```
cardId | cardName | supplementInfo | supplementDate |
pendulumSupplementInfo | pendulumSupplementDate
```

詳細は[スキーマドキュメント](docs/schema/detail-all.md)を参照してください。

### 3. faq/ - FAQ詳細情報

**ステータス**: ✅ **完了**

ルール裁定のFAQ詳細（質問・回答・更新日）

- **出力**: `output/data/faq-all.tsv`
- **件数**: 12,577 FAQ（ヘッダー除く）
- **サイズ**: 16MB
- **フォーマット**: TSV（タブ区切り）
- **スキーマ**: [docs/schema/faq-all.md](docs/schema/faq-all.md)

**カラム**:
```
faqId | question | answer | updatedAt
```

詳細は[スキーマドキュメント](docs/schema/faq-all.md)を参照してください。

**補足**: FAQ ID一覧も利用可能
- `output/data/faqid-all.tsv` (12,578件)

---

## 🔧 今後同様のデータを取得する場合

### 前提条件

1. **Bun環境**: Bunランタイムがインストールされていること
2. **依存関係**: `jsdom`パッケージのインストール
   ```bash
   bun install
   ```

### セッション管理

全てのスクリプトは実行時に自動的にセッションを確立します。Cookieファイルの準備は不要です。

### 基本的な使い方

#### データ更新（増分取得）

```bash
# カード基本情報のみ更新
bun run update:cards

# カード詳細情報のみ更新
bun run update:detail

# FAQ情報のみ更新
bun run update:faq

# 全てを更新
bun run update:all
```

#### 新しい方から件数指定取得

```bash
# カード基本情報の新しい方から10件取得
bun run update:cards --top 10

# カード詳細情報の新しい方から10件取得
bun run update:detail --top 10

# FAQ情報の新しい方から10件取得
bun run update:faq --top 10

# 全てを新しい方から10件ずつ取得
bun run update:all --top 10
```

#### 範囲指定取得

```bash
# カード基本情報の0番目から10件取得
bun run update:cards --range 0 10

# カード詳細情報の100番目から50件取得
bun run update:detail --range 100 50

# FAQ情報の50番目から20件取得
bun run update:faq --range 50 20

# 全てを0番目から10件ずつ取得
bun run update:all --range 0 10
```

#### 全件取得（初回セットアップ時）

```bash
# カード基本情報の全件取得
# 注: cardsは手動でHTMLを取得後、parse-to-tsv.tsで変換する必要があります
# 詳細は cards-data/README.md を参照

# カード詳細情報の全件取得
bun run update:detail --force-all

# FAQ情報の全件取得
bun run update:faq --force-all

# 詳細とFAQのみ全件取得
bun run update:detail --force-all
bun run update:faq --force-all
```

#### 出力先

- カード基本情報: `output/data/cards-all.tsv`
- カード詳細情報: `output/data/detail-all.tsv`
- FAQ情報: `output/data/faq-all.tsv`

#### 中断時の再開

全件取得の途中で中断された場合、`--start-from`オプションで再開できます:

```bash
# カード詳細を6000件目から再開
bun run src/cards-detail/fetch-qa-all.ts --start-from=6000

# FAQを4000件目から再開
bun run src/faq/fetch-faq-from-list.ts --start-from=4000
```

---

## 📋 コマンドリファレンス

### データ更新コマンド

| コマンド | 説明 | 所要時間 |
|---------|------|---------|
| `bun run update:cards` | カード基本情報の増分取得 | 数秒〜数分 |
| `bun run update:detail` | カード詳細情報の増分取得 | 新規カード数 × 1秒 |
| `bun run update:faq` | FAQ情報の増分取得 | 新規FAQ数 × 1秒 |
| `bun run update:all` | 全データの増分取得 | 上記の合計 |

### 新しい方から件数指定取得（--top N）

| コマンド | 説明 | 所要時間 |
|---------|------|---------|
| `bun run update:cards --top 10` | カード基本情報の新しい方から10件 | 数秒 |
| `bun run update:detail --top 10` | カード詳細情報の新しい方から10件 | 約10秒 |
| `bun run update:faq --top 10` | FAQ情報の新しい方から10件 | 約10秒 |
| `bun run update:all --top 10` | 全データの新しい方から10件ずつ | 約30秒 |

### 範囲指定取得（--range START LENGTH）

| コマンド | 説明 | 所要時間 |
|---------|------|---------|
| `bun run update:cards --range 0 10` | カード基本情報の0番目から10件 | 数秒 |
| `bun run update:detail --range 100 50` | カード詳細情報の100番目から50件 | 約50秒 |
| `bun run update:faq --range 50 20` | FAQ情報の50番目から20件 | 約20秒 |

### 全件取得コマンド（--force-all）

| コマンド | 説明 | 所要時間 |
|---------|------|---------|
| `bun run update:detail --force-all` | カード詳細情報の全件取得 | 約2.5時間 |
| `bun run update:faq --force-all` | FAQ情報の全件取得 | 約3.5時間 |

**注意**: カード基本情報（cards）の全件取得は、手動でHTMLファイルを取得後、`parse-to-tsv.ts`で変換する必要があります。詳細は`src/cards-data/`のドキュメントを参照してください。

### 増分取得の仕組み

- **cards**: 発売日順（新しい順）でソートし、既存cardIdを検出したら停止
- **detail**: cards-all.tsvとqa-all.tsvのcardIdを比較し、差分のみ取得
- **faq**: 更新日時順（新しい順）でソートし、既存faqIdを検出したら停止

### 新しい方から件数指定取得の仕組み（--top N）

- **cards**: 発売日順（新しい順）で先頭からN件を取得してマージ
- **detail**: cards-all.tsvの先頭（新しい順）からN件のcardIdを取得してマージ
- **faq**: 更新日時順（新しい順）で先頭からN件を取得してマージ
- 既存データがある場合は重複チェックを行い、新規のみ追加または更新

### 範囲指定取得の仕組み（--range START LENGTH）

- **cards**: 発売日順（新しい順）でSTART番目からLENGTH件を取得してマージ
- **detail**: cards-all.tsvのSTART番目からLENGTH件のcardIdを取得してマージ
- **faq**: 更新日時順（新しい順）でSTART番目からLENGTH件を取得してマージ
- STARTは0から始まるインデックス（0が最新）
- 既存データがある場合は重複チェックを行い、新規のみ追加または更新

---

## ⚠️ 重要な注意事項

### サーバー負荷への配慮

- **リクエスト間隔**: 各スクリプトは1秒間隔でリクエスト送信
- **中断時の再開**: 中間ファイル（temp/*.tsv）から安全に再開可能
- **チェックポイント**: 1000件ごとに自動保存

### エラーハンドリング

- ネットワークエラーや解析エラーが発生しても処理は継続
- エラー件数は最終レポートで確認可能
- 中断された場合は `--start-from` オプションで再開

### データ形式

- **エスケープ**: タブ、改行、キャリッジリターンは `\t`, `\n`, `\r` に置換済み
- **カードリンク**: テキスト内のカードリンクは `{{カード名|cardId}}` 形式
- **エンコーディング**: UTF-8

---

## 📂 ディレクトリ構造詳細

### src/
```
src/
├── cards-data/
│   ├── fetch-incremental.ts    増分取得スクリプト
│   ├── parse-to-tsv.ts         HTMLからTSVへの変換スクリプト
│   └── fetch-html.sh           HTML取得用シェルスクリプト
├── cards-detail/
│   ├── fetch-incremental.ts    増分取得スクリプト
│   ├── fetch-qa-all.ts         全カード補足情報取得（メイン）
│   ├── fetch-qa-batch.ts       バッチ処理用（テスト）
│   └── fetch-qa-to-tsv.ts      TSV変換用（テスト）
└── faq/
    ├── fetch-incremental.ts         増分取得スクリプト
    ├── fetch-faqid-list.ts          FAQ ID一覧取得
    ├── fetch-faq-from-list.ts       FAQ詳細取得（メイン・推奨）
    ├── fetch-faq-details-all.ts     カード別FAQ取得（別アプローチ）
    └── fetch-faq-details-test.ts    テスト用
```

### output/
```
output/
├── data/
│   ├── cards-all.tsv           カード基本情報（最終出力）
│   ├── detail-all.tsv         カード補足情報（最終出力）
│   ├── faq-all.tsv             FAQ詳細（最終出力）
│   └── faqid-all.tsv           FAQ ID一覧（オプション）
└── .temp/                      一時ファイル（1000件ごと）
    ├── cards-detail/           detail-all-temp-*.tsv
    └── faq/                    faq-all-temp-*.tsv
```

---

## 🔍 データの活用例

### 1. カード検索システム

```typescript
// cards-all.tsvを読み込んでカード検索
// 例: 「ブラック・マジシャン」の情報を取得
```

### 2. ルール裁定データベース

```typescript
// faq-all.tsvを読み込んでFAQ検索
// カードリンク {{カード名|cardId}} を解析して関連カードを紐付け
```

### 3. RAG (Retrieval-Augmented Generation)

- カード情報 + FAQ + 補足情報を組み合わせて、AIによる質問応答システムを構築
- ベクトルデータベースに格納して意味検索を実装

---

## 🛠️ トラブルシューティング

### 中断された処理を再開

```bash
# 最新の中間ファイルを確認
ls -lht output/.temp/cards-detail/*.tsv | head -1
# 例: detail-all-temp-8000.tsv が最新の場合

# 8000件目から再開
bun run src/cards-detail/fetch-qa-all.ts --start-from=8000
```

### データの整合性確認

```bash
# 行数確認（ヘッダー含む）
wc -l output/data/cards-all.tsv      # 13754行
wc -l output/data/detail-all.tsv    # 13754行
wc -l output/data/faq-all.tsv        # 12578行
```

---

## 📝 変更履歴

### 2025-12-18 (最新)
- ✅ **新機能**: 新しい方から件数指定取得機能を追加（`--top N`オプション）
  - `bun run update:cards --top 10` で最新10件のカードを取得
  - `bun run update:detail --top 10` で最新10件のカード詳細を取得
  - `bun run update:faq --top 10` で最新10件のFAQを取得
- ✅ **新機能**: 範囲指定取得機能を追加（`--range START LENGTH`オプション）
  - `bun run update:cards --range 0 10` で0番目から10件のカードを取得
  - `bun run update:detail --range 100 50` で100番目から50件のカード詳細を取得
  - `bun run update:faq --range 50 20` で50番目から20件のFAQを取得
- ✅ コマンドライン引数の解析処理を共通化（`src/utils/helpers.ts`）
- ✅ 4つのスクリプトで統一的なモード切り替えを実装
  - 増分取得モード（デフォルト）
  - 新しい方からN件取得モード（`--top N`）
  - 範囲指定取得モード（`--range START LENGTH`）
  - 指定ID取得モード（`--ids`, `--ids-file`）

### 2025-12-18
- ✅ Bunへ移行
- ✅ ディレクトリ構造をsrc/とoutput/に整理
- ✅ 全スクリプトで自動セッション確立に統一（cookies.txt不要）
- ✅ 統一的なコマンド体系に変更（`update:cards`, `update:all`等）
- ✅ 出力ディレクトリ構造を変更
  - 全TSVファイルを`output/data/`に統一
  - `qa-all.tsv` → `detail-all.tsv` にリネーム
  - 一時ファイルを`output/.temp/`に集約
  - 詳細: `docs/changelog/2025-12-18-output-restructure.md`

### 2025-11-21
- ✅ biko情報（備考・公式使用不可フラグ）をcards-dataに追加
- ✅ 増分取得機能を実装
  - cards-data/scripts/fetch-incremental.ts
  - faq/scripts/fetch-incremental.ts
  - cards-detail/scripts/fetch-incremental.ts
- ✅ READMEに増分取得セクションを追加

### 2025-11-14
- ✅ 全データ取得完了
- ✅ ディレクトリ構造整理
- ✅ 不要ファイルを_archived/に移動
- ✅ README更新（今後の取得手順を追加）

### 実行履歴
- cards-data: HTMLパース完了（2025-11-14以前）
- cards-detail: 6000件から再開 → 13753件完了（約2時間10分）
- faq: 4000件から再開 → 12577件完了（約2時間20分）

---

## 📧 問い合わせ

このプロジェクトに関する質問や改善提案は、プロジェクト管理者まで。

---

**Note**: このREADMEは今後のデータ更新時の参考資料として作成されました。

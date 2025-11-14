# 遊戯王カードデータベース スクレイピングプロジェクト

## 概要

遊戯王公式カードデータベース（https://www.db.yugioh-card.com/）から、カード情報とFAQ情報を取得するプロジェクトです。

**最終更新日**: 2025-11-14
**ステータス**: ✅ **全データ取得完了**

---

## 📁 プロジェクト構造

```
scraping/
├── cards-data/       カード基本情報（✅ 完了）
├── cards-detail/     カード補足情報（✅ 完了）
├── faq/              FAQ詳細情報（✅ 完了）
└── _archived/        アーカイブ（中間ファイル、テストデータ等）
```

---

## 📊 取得済みデータ

### 1. cards-data/ - カード基本情報

**ステータス**: ✅ **完了**

カードの基本情報（名前、種族、属性、攻撃力、守備力、効果テキストなど）

- **出力**: `cards-data/output/cards-all.tsv`
- **件数**: 13,754カード
- **サイズ**: 8.2MB
- **フォーマット**: TSV（タブ区切り）

**カラム**:
```
cardType | name | ruby | cardId | ciid | imgs | text | attribute | levelType |
levelValue | race | types | atk | def | linkMarkers | pendulumScale |
pendulumEffect | isExtraDeck | spellEffectType | trapEffectType
```

### 2. cards-detail/ - カード補足情報

**ステータス**: ✅ **完了**

各カードのルール補足情報とペンデュラム補足情報

- **出力**: `cards-detail/output/qa-all.tsv`
- **件数**: 13,753カード（ヘッダー除く）
- **サイズ**: 13MB
- **フォーマット**: TSV（タブ区切り）

**カラム**:
```
cardId | cardName | supplementInfo | supplementDate |
pendulumSupplementInfo | pendulumSupplementDate
```

### 3. faq/ - FAQ詳細情報

**ステータス**: ✅ **完了**

ルール裁定のFAQ詳細（質問・回答・更新日）

- **出力**: `faq/output/faq-all.tsv`
- **件数**: 12,577 FAQ（ヘッダー除く）
- **サイズ**: 16MB
- **フォーマット**: TSV（タブ区切り）

**カラム**:
```
faqId | question | answer | updatedAt
```

**補足**: FAQ ID一覧も利用可能
- `faq/output/faqid-all.tsv` (12,578件)

---

## 🔧 今後同様のデータを取得する場合

### 前提条件

1. **Node.js環境**: npxコマンドが使用可能であること
2. **依存関係**: `jsdom`パッケージのインストール
   ```bash
   npm install jsdom
   ```
3. **認証情報**: `config/cookies.txt`ファイルが必要

### Cookieファイルの取得方法

1. ブラウザで遊戯王カードデータベース（https://www.db.yugioh-card.com/）にアクセス
2. ブラウザの開発者ツールを開く（F12）
3. Networkタブでリクエストを確認
4. Cookieをエクスポート（Netscape形式）
5. `cards-detail/config/cookies.txt` と `faq/config/cookies.txt` に保存

### 実行手順

#### 1. カード基本情報の取得

```bash
# 1. カード検索ページからHTMLを取得（ブラウザで手動）
# https://www.db.yugioh-card.com/yugiohdb/card_search.action
# ページ1～7のHTMLを cards-data/raw/cards/ に保存

# 2. HTMLをTSVに変換
cd cards-data/scripts
npx tsx parse-to-tsv.ts

# 出力: cards-data/output/cards-all.tsv
```

#### 2. カード補足情報の取得

```bash
# cards-all.tsvを入力として使用
cd cards-detail/scripts
npx tsx fetch-qa-all.ts

# 再開する場合（例: 6000件目から）
npx tsx fetch-qa-all.ts --start-from=6000

# 出力: cards-detail/output/qa-all.tsv
# 中間ファイル: cards-detail/temp/qa-all-temp-*.tsv（1000件ごと）
```

**所要時間**: 約2時間30分（13,754カード × 1秒間隔）

#### 3. FAQ詳細情報の取得

```bash
# ステップ1: FAQ ID一覧を取得
cd faq/scripts
npx tsx fetch-faqid-list.ts
# 出力: faq/output/faqid-all.tsv

# ステップ2: FAQ詳細を取得
npx tsx fetch-faq-from-list.ts

# 再開する場合（例: 4000件目から）
npx tsx fetch-faq-from-list.ts --start-from=4000

# 出力: faq/output/faq-all.tsv
# 中間ファイル: faq/temp/faq-all-temp-*.tsv（1000件ごと）
```

**所要時間**: 約3時間30分（FAQ ID一覧: 2分 + FAQ詳細: 3時間30分）

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

### cards-data/
```
cards-data/
├── scripts/
│   └── parse-to-tsv.ts         HTMLからTSVへの変換スクリプト
└── output/
    └── cards-all.tsv           カード基本情報（最終出力）
```

### cards-detail/
```
cards-detail/
├── scripts/
│   ├── fetch-qa-all.ts         全カード補足情報取得（メイン）
│   ├── fetch-qa-batch.ts       バッチ処理用（テスト）
│   └── fetch-qa-to-tsv.ts      TSV変換用（テスト）
├── input/
│   └── cards-all.tsv           入力データ（cards-dataからコピー）
├── config/
│   └── cookies.txt             認証用Cookie
├── output/
│   └── qa-all.tsv              カード補足情報（最終出力）
└── README.md
```

### faq/
```
faq/
├── scripts/
│   ├── fetch-faqid-list.ts         FAQ ID一覧取得
│   ├── fetch-faq-from-list.ts      FAQ詳細取得（メイン・推奨）
│   ├── fetch-faq-details-all.ts    カード別FAQ取得（別アプローチ）
│   └── fetch-faq-details-test.ts   テスト用
├── input/
│   └── cards-all.tsv               参照用カードデータ
├── config/
│   ├── cookies.txt                 認証用Cookie
│   └── cookies-faq.txt             FAQ専用Cookie（オプション）
├── output/
│   ├── faqid-all.tsv               FAQ ID一覧
│   └── faq-all.tsv                 FAQ詳細（最終出力）
└── README.md
```

### _archived/
```
_archived/
├── _orig/                      元データ（整理前のバックアップ）
├── cards-data-raw/             元HTMLファイル
├── cards-data-docs/            分析用ドキュメント
├── cards-detail-temp/          中間ファイル（1000件ごと）
├── cards-detail-test/          テストデータ
├── cards-detail-docs/          分析用ドキュメント
├── faq-temp/                   中間ファイル（1000件ごと）
├── faq-test/                   テストデータ
├── faq-docs/                   分析用ドキュメント
└── logs/                       実行ログ
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

### Cookie が無効になった場合

1. ブラウザで再度ログイン
2. 新しいCookieを取得
3. `config/cookies.txt` を更新
4. スクリプトを再実行

### 中断された処理を再開

```bash
# 最新の中間ファイルを確認
ls -lht cards-detail/temp/*.tsv | head -1
# 例: qa-all-temp-8000.tsv が最新の場合

# 8000件目から再開
cd cards-detail/scripts
npx tsx fetch-qa-all.ts --start-from=8000
```

### データの整合性確認

```bash
# 行数確認（ヘッダー含む）
wc -l cards-data/output/cards-all.tsv      # 13754行
wc -l cards-detail/output/qa-all.tsv       # 13754行
wc -l faq/output/faq-all.tsv               # 12578行
```

---

## 📝 変更履歴

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

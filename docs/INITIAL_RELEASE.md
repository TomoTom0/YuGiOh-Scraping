# 初回リリース手順

自動週次更新を開始する前に、初回データを手動でリリースする必要があります。

## 手順

### 1. データ取得

```bash
# リポジトリのルートで実行
bun run update:all
```

これで `output/data/` に以下のファイルが生成されます：
- `cards-all.tsv`
- `details-all.tsv`
- `faq-all.tsv`

### 2. アーカイブ作成

```bash
# 日付を取得（例: 2025.12.19）
DATE=$(date -u +%Y.%m.%d)

# アーカイブ作成
cd output/data
tar -czf ../../ygo-data-${DATE}.tar.gz *.tsv
cd ../..

# 確認
ls -lh ygo-data-${DATE}.tar.gz
```

### 3. GitHub Releaseを作成

```bash
# リリース作成
gh release create ${DATE} \
  ygo-data-${DATE}.tar.gz \
  --title "遊戯王データ ${DATE}" \
  --notes "初回データリリース

## データ統計
- カード基本情報: $(wc -l < output/data/cards-all.tsv) 行
- カード詳細情報: $(wc -l < output/data/details-all.tsv) 行
- FAQ情報: $(wc -l < output/data/faq-all.tsv) 行

## ファイル内容
- \`cards-all.tsv\`: カード基本情報（名前、種族、属性、攻撃力等）
- \`details-all.tsv\`: カード補足情報（ルール補足、ペンデュラム補足）
- \`faq-all.tsv\`: FAQ詳細（質問・回答・更新日）

## データ形式
- エンコーディング: UTF-8
- 区切り文字: タブ（TSV）
- ソート順: ID降順（新しいものが先頭）"
```

### 4. 自動更新の確認

初回リリースが完了すると、次の日曜日から自動的に週次更新が実行されます。

GitHub Actions の実行は以下で確認できます：
https://github.com/TomoTom0/YuGiOh-Scraping/actions

## 手動での更新実行

自動スケジュール以外に、手動で更新を実行することもできます：

1. GitHub リポジトリページに移動
2. "Actions" タブを開く
3. "Weekly Data Update" ワークフローを選択
4. "Run workflow" ボタンをクリック
5. ブランチ（dev）を選択して実行

## トラブルシューティング

### 前回リリースが見つからないエラー

```
❌ エラー: 前回リリースが見つかりません
初回データを手動でアップロードしてください
```

→ この手順書に従って初回リリースを作成してください。

### データが更新されない

- 増分取得では既存データと重複がない場合、新規データは0件になります
- 新しいカードやFAQがリリースされていない週は更新がない可能性があります

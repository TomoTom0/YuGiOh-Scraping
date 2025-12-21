# detail-all.tsv スキーマ

カード補足情報とルール補足データ。

## カラム

| カラム名 | 型 | 説明 | 例 |
|-------------|------|-------------|---------|
| cardId | number | カード識別番号 (cards-all.tsv を参照) | `22593` |
| cardName | string | 参照用カード名 | `ミラクル・エクスクルーダー` |
| supplementInfo | string | ルール補足と説明テキスト | `【『このカード名はルール上「E・HERO」カードとしても扱う』について】\n...` |
| supplementDate | date | 補足情報の最終更新日 (YYYY-MM-DD) | `2025-12-18` |
| pendulumSupplementInfo | string | ペンデュラム効果補足テキスト (非ペンデュラムは空) | `""` |
| pendulumSupplementDate | date | ペンデュラム補足の最終更新日 | `""` |

## データ型

### 日付
日付は ISO 8601 形式: `YYYY-MM-DD`

### テキストフィールド
- `supplementInfo`: 複数行を `\n` で区切って含む場合があります
- `pendulumSupplementInfo`: 複数行を `\n` で区切って含む場合があります
- 両方とも `{{カード名|cardId}}` 形式のWikiスタイルマークアップを含む場合があります

## 空値
- `supplementInfo` と `supplementDate` は補足がないカードの場合空になります
- `pendulumSupplementInfo` と `pendulumSupplementDate` は非ペンデュラムモンスターの場合空になります

## リレーション

各行は `cardId` で識別される `cards-all.tsv` のカードに対応します。補足情報がないカードは行がない場合があります。

## 文字エンコーディング

全テキストは UTF-8 でエンコードされています。

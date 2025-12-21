# cards-all.tsv スキーマ

カード基本情報と属性データ。

## カラム

| カラム名 | 型 | 説明 | 例 |
|-------------|------|-------------|---------|
| cardType | string | カード種類 (monster/spell/trap) | `monster` |
| name | string | 公式カード名 | `ミラクル・エクスクルーダー` |
| nameModified | string | 検索用の記号除去カード名 | `ミラクルエクスクルーダー` |
| ruby | string | 読み仮名 | `ミラクル・エクスクルーダー` |
| cardId | number | カード固有識別番号 | `22593` |
| ciid | number | カード画像ID | `1` |
| imgs | JSON配列 | ハッシュ付きカード画像 | `[{"ciid":"1","imgHash":"Y94JqtKC23Lbh1W5UB_D-Q"}]` |
| text | string | カード効果テキスト | `このカード名はルール上「E・HERO」カードとしても扱う。...` |
| biko | string | カード補足説明 | なければ空文字列 |
| isNotLegalForOfficial | boolean | 公式大会で使用不可かどうか | `false` |
| attribute | string | モンスター属性 (earth/water/fire/wind/light/dark/divine) | `earth` |
| levelType | string | レベル種別 (level/rank/link) | `level` |
| levelValue | number | モンスターレベル/ランク/リンク値 | `3` |
| race | string | モンスター種族 | `spellcaster` |
| monsterTypes | JSON配列 | モンスタータイプ (effect/normal/fusion等) | `["effect"]` |
| atk | number | 攻撃力 | `400` |
| def | number | 守備力 | `400` |
| linkMarkers | JSON配列 | リンクマーカー (リンク以外は空配列) | `[]` |
| pendulumScale | number | ペンデュラムスケール (非ペンデュラムは空) | `""` |
| pendulumText | string | ペンデュラム効果テキスト | `""` |
| isExtraDeck | boolean | エクストラデッキカードかどうか | `false` |
| spellEffectType | string | 魔法カード種別 (速攻/フィールド/儀式等) | `""` |
| trapEffectType | string | 罠カード種別 (通常/永続/カウンター) | `""` |

## データ型

### JSON配列
一部のフィールドはJSON形式の配列を含みます：
- `imgs`: `ciid` と `imgHash` を持つ画像オブジェクトの配列
- `monsterTypes`: モンスタータイプの文字列配列
- `linkMarkers`: リンクマーカー方向の配列

### 真偽値
- `true` / `false` (小文字)

### 空値
カードタイプに該当しない場合、フィールドは空文字列 (`""`) になります。

## ソート順

データは `cardId` の降順（新しいカードが先）でソートされています。

## 文字エンコーディング

全テキストは UTF-8 でエンコードされています。

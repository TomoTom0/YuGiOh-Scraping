# cards-all.tsv Schema

Card basic information and attributes.

## Columns

| Column Name | Type | Description | Example |
|-------------|------|-------------|---------|
| cardType | string | Card type (monster/spell/trap) | `monster` |
| name | string | Official card name | `ミラクル・エクスクルーダー` |
| nameModified | string | Card name without punctuation for searching | `ミラクルエクスクルーダー` |
| ruby | string | Furigana (reading guide) | `ミラクル・エクスクルーダー` |
| cardId | number | Unique card identifier | `22593` |
| ciid | number | Card image ID | `1` |
| imgs | JSON array | Card images with hash | `[{"ciid":"1","imgHash":"Y94JqtKC23Lbh1W5UB_D-Q"}]` |
| text | string | Card effect text | `このカード名はルール上「E・HERO」カードとしても扱う。...` |
| biko | string | Card supplement notes | Empty string if none |
| isNotLegalForOfficial | boolean | Whether card is legal for official play | `false` |
| attribute | string | Monster attribute (earth/water/fire/wind/light/dark/divine) | `earth` |
| levelType | string | Level type (level/rank/link) | `level` |
| levelValue | number | Monster level/rank/link rating | `3` |
| race | string | Monster race/type | `spellcaster` |
| monsterTypes | JSON array | Monster types (effect/normal/fusion/etc) | `["effect"]` |
| atk | number | Attack power | `400` |
| def | number | Defense power | `400` |
| linkMarkers | JSON array | Link markers (empty for non-link monsters) | `[]` |
| pendulumScale | number | Pendulum scale (empty for non-pendulum) | `""` |
| pendulumText | string | Pendulum effect text | `""` |
| isExtraDeck | boolean | Whether card belongs to Extra Deck | `false` |
| spellEffectType | string | Spell card type (quick-play/field/ritual/etc) | `""` |
| trapEffectType | string | Trap card type (normal/continuous/counter) | `""` |

## Data Types

### JSON Arrays
Some fields contain JSON-formatted arrays:
- `imgs`: Array of image objects with `ciid` and `imgHash`
- `monsterTypes`: Array of monster type strings
- `linkMarkers`: Array of link marker directions

### Boolean Values
- `true` / `false` (lowercase)

### Empty Values
Fields may be empty strings (`""`) when not applicable to the card type.

## Sorting

Data is sorted by `cardId` in descending order (newest cards first).

## Character Encoding

All text is encoded in UTF-8.

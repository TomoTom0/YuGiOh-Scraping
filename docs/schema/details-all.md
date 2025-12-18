# details-all.tsv Schema

Card supplementary information and rule clarifications.

## Columns

| Column Name | Type | Description | Example |
|-------------|------|-------------|---------|
| cardId | number | Card identifier (references cards-all.tsv) | `22593` |
| cardName | string | Card name for reference | `ミラクル・エクスクルーダー` |
| supplementInfo | string | Rule clarification and supplement text | `【『このカード名はルール上「E・HERO」カードとしても扱う』について】\n...` |
| supplementDate | date | Date when supplement was last updated (YYYY-MM-DD) | `2025-12-18` |
| pendulumSupplementInfo | string | Pendulum effect supplement text (empty for non-pendulum) | Empty |
| pendulumSupplementDate | date | Date when pendulum supplement was last updated | Empty |

## Data Types

### Dates
Dates are in ISO 8601 format: `YYYY-MM-DD`

### Text Fields
- `supplementInfo`: May contain multiple lines separated by `\n`
- `pendulumSupplementInfo`: May contain multiple lines separated by `\n`
- Both may contain wiki-style markup with `{{cardName|cardId}}`

## Empty Values
- `supplementInfo` and `supplementDate` may be empty for cards without clarifications
- `pendulumSupplementInfo` and `pendulumSupplementDate` are empty for non-pendulum monsters

## Relationship

Each row corresponds to a card in `cards-all.tsv` identified by `cardId`. A card may not have a row if it has no supplements.

## Character Encoding

All text is encoded in UTF-8.

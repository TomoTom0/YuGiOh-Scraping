# faq-all.tsv Schema

FAQ (Frequently Asked Questions) about card rulings and clarifications.

## Columns

| Column Name | Type | Description | Example |
|-------------|------|-------------|---------|
| faqId | number | Unique FAQ identifier | `24256` |
| question | string | FAQ question text | `自分が「{{増援\|5328}}」を発動し...` |
| answer | string | FAQ answer text | `ターンプレイヤーである自分が先に...` |
| updatedAt | date | Date when FAQ was last updated (YYYY-MM-DD) | `2025-12-11` |

## Data Types

### Dates
Dates are in ISO 8601 format: `YYYY-MM-DD`

### Text Fields
- `question`: FAQ question (may contain multiple lines with `\n`)
- `answer`: FAQ answer (may contain multiple lines with `\n`)
- Both may contain wiki-style markup with `{{cardName|cardId}}`

### Wiki-style Markup
Card references use the format: `{{cardName|cardId}}`

Example: `{{増援|5328}}` refers to the card "増援" (card ID 5328)

## Text Content

### Question Field
Contains the FAQ question, often referring to specific card effects and game situations.

### Answer Field
Contains the official ruling or clarification for the question. May include:
- Direct rulings
- Explanations of game mechanics
- Priority rules
- Complex interactions between multiple cards

## Sorting

Data is sorted by `faqId` in descending order (newest FAQs first).

## Character Encoding

All text is encoded in UTF-8.

import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { parseSearchResultRow, extractImageInfo } from '../../src/api/card-search';
import { CardInfo, MonsterCard, SpellCard, TrapCard } from '../../src/types/card';

/**
 * CardInfoをTSV行に変換
 */
function cardInfoToTsvRow(card: CardInfo): string {
  const fields: string[] = [];

  // 共通フィールド
  fields.push(escapeForTsv(card.cardType));
  fields.push(escapeForTsv(card.name));
  fields.push(escapeForTsv(card.ruby || ''));
  fields.push(escapeForTsv(card.cardId));
  fields.push(escapeForTsv(card.ciid));
  fields.push(escapeForTsv(JSON.stringify(card.imgs)));
  fields.push(escapeForTsv(card.text || ''));

  // カードタイプ別フィールド
  if (card.cardType === 'monster') {
    const monster = card as MonsterCard;
    fields.push(escapeForTsv(monster.attribute));
    fields.push(escapeForTsv(monster.levelType));
    fields.push(escapeForTsv(monster.levelValue.toString()));
    fields.push(escapeForTsv(monster.race));
    fields.push(escapeForTsv(JSON.stringify(monster.types)));
    fields.push(escapeForTsv(monster.atk !== undefined ? monster.atk.toString() : ''));
    fields.push(escapeForTsv(monster.def !== undefined ? monster.def.toString() : ''));
    fields.push(escapeForTsv(monster.linkMarkers !== undefined ? monster.linkMarkers.toString() : ''));
    fields.push(escapeForTsv(monster.pendulumScale !== undefined ? monster.pendulumScale.toString() : ''));
    fields.push(escapeForTsv(monster.pendulumEffect || ''));
    fields.push(escapeForTsv(monster.isExtraDeck.toString()));
  } else if (card.cardType === 'spell') {
    const spell = card as SpellCard;
    fields.push(''); // attribute
    fields.push(''); // levelType
    fields.push(''); // levelValue
    fields.push(''); // race
    fields.push(''); // types
    fields.push(''); // atk
    fields.push(''); // def
    fields.push(''); // linkMarkers
    fields.push(''); // pendulumScale
    fields.push(''); // pendulumEffect
    fields.push(''); // isExtraDeck
    fields.push(escapeForTsv(spell.effectType || ''));
  } else if (card.cardType === 'trap') {
    const trap = card as TrapCard;
    fields.push(''); // attribute
    fields.push(''); // levelType
    fields.push(''); // levelValue
    fields.push(''); // race
    fields.push(''); // types
    fields.push(''); // atk
    fields.push(''); // def
    fields.push(''); // linkMarkers
    fields.push(''); // pendulumScale
    fields.push(''); // pendulumEffect
    fields.push(''); // isExtraDeck
    fields.push(''); // (魔法のeffectType用の空欄)
    fields.push(escapeForTsv(trap.effectType || ''));
  }

  return fields.join('\t');
}

/**
 * TSV用にエスケープ
 */
function escapeForTsv(value: string): string {
  if (!value) return '';
  // タブ、改行、キャリッジリターンを置換
  return value
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * TSVヘッダー行を生成
 */
function getTsvHeader(): string {
  return [
    'cardType',
    'name',
    'ruby',
    'cardId',
    'ciid',
    'imgs',
    'text',
    // モンスター用フィールド
    'attribute',
    'levelType',
    'levelValue',
    'race',
    'types',
    'atk',
    'def',
    'linkMarkers',
    'pendulumScale',
    'pendulumEffect',
    'isExtraDeck',
    // 魔法・罠用フィールド
    'spellEffectType',
    'trapEffectType'
  ].join('\t');
}

/**
 * メイン処理
 */
async function main() {
  console.log('=== Starting TSV generation ===\n');

  const cardsDir = path.join(__dirname, 'cards');
  const outputPath = path.join(__dirname, 'cards-all.tsv');

  const allCards: CardInfo[] = [];

  // 全7ページを処理
  for (let page = 1; page <= 7; page++) {
    const htmlPath = path.join(cardsDir, `page-${page}.html`);

    if (!fs.existsSync(htmlPath)) {
      console.error(`File not found: ${htmlPath}`);
      continue;
    }

    console.log(`Processing ${htmlPath}...`);

    const html = fs.readFileSync(htmlPath, 'utf8');
    const dom = new JSDOM(html, {
      url: 'https://www.db.yugioh-card.com/yugiohdb/card_search.action'
    });
    const doc = dom.window.document as unknown as Document;

    // 画像情報を抽出
    const imageInfoMap = extractImageInfo(doc);
    console.log(`  Extracted image info for ${imageInfoMap.size} cards`);

    // カード行を取得
    const rows = doc.querySelectorAll('.t_row');
    console.log(`  Found ${rows.length} card rows`);

    // 各行をパース
    let successCount = 0;
    rows.forEach((row) => {
      const card = parseSearchResultRow(row as HTMLElement, imageInfoMap);
      if (card) {
        allCards.push(card);
        successCount++;
      }
    });

    console.log(`  Successfully parsed ${successCount} cards\n`);
  }

  console.log(`Total cards collected: ${allCards.length}\n`);

  // TSVファイルを生成
  console.log(`Writing TSV to ${outputPath}...`);

  const tsvLines: string[] = [];
  tsvLines.push(getTsvHeader());

  allCards.forEach((card) => {
    tsvLines.push(cardInfoToTsvRow(card));
  });

  fs.writeFileSync(outputPath, tsvLines.join('\n'), 'utf8');

  console.log(`✓ TSV file created: ${outputPath}`);
  console.log(`  Total records: ${allCards.length}`);
  console.log(`  File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB\n`);

  // カードタイプ別の集計
  const monsterCards = allCards.filter(c => c.cardType === 'monster');
  const spellCards = allCards.filter(c => c.cardType === 'spell');
  const trapCards = allCards.filter(c => c.cardType === 'trap');

  console.log('=== Card Type Summary ===');
  console.log(`Monster cards: ${monsterCards.length}`);
  console.log(`Spell cards: ${spellCards.length}`);
  console.log(`Trap cards: ${trapCards.length}`);
  console.log('\n✓ Done!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

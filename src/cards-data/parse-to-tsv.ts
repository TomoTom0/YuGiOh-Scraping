import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 型定義
// ============================================================================

type CardType = 'monster' | 'spell' | 'trap';
type LevelType = 'level' | 'rank' | 'link';
type LimitRegulation = 'forbidden' | 'limited' | 'semi-limited';
type Attribute = 'light' | 'dark' | 'water' | 'fire' | 'earth' | 'wind' | 'divine';
type Race = 'dragon' | 'warrior' | 'spellcaster' | 'fairy' | 'fiend' | 'zombie' | 'machine' | 'aqua' | 'pyro' | 'rock' | 'windbeast' | 'plant' | 'insect' | 'thunder' | 'beast' | 'beastwarrior' | 'dinosaur' | 'fish' | 'seaserpent' | 'reptile' | 'psychic' | 'divine' | 'creatorgod' | 'wyrm' | 'cyberse' | 'illusion';
type MonsterType = 'normal' | 'effect' | 'fusion' | 'ritual' | 'synchro' | 'xyz' | 'pendulum' | 'link' | 'tuner' | 'spirit' | 'union' | 'gemini' | 'flip' | 'toon' | 'special';
type SpellEffectType = 'normal' | 'quick' | 'continuous' | 'equip' | 'field' | 'ritual';
type TrapEffectType = 'normal' | 'continuous' | 'counter';

interface CardBase {
  name: string;
  ruby?: string;
  cardId: string;
  ciid: string;
  imgs: Array<{ciid: string; imgHash: string}>;
  text?: string;
  limitRegulation?: LimitRegulation;
  biko?: string;
  isNotLegalForOfficial: boolean;
}

interface MonsterCard extends CardBase {
  cardType: 'monster';
  attribute: Attribute;
  levelType: LevelType;
  levelValue: number;
  race: Race;
  monsterTypes: MonsterType[];
  atk?: number | string;
  def?: number | string;
  linkMarkers?: number;
  pendulumScale?: number;
  pendulumText?: string;
  isExtraDeck: boolean;
}

interface SpellCard extends CardBase {
  cardType: 'spell';
  effectType?: SpellEffectType;
}

interface TrapCard extends CardBase {
  cardType: 'trap';
  effectType?: TrapEffectType;
}

// ============================================================================
// マッピングデータ
// ============================================================================

const ATTRIBUTE_PATH_TO_ID: Record<string, Attribute> = {
  'light': 'light',
  'dark': 'dark',
  'water': 'water',
  'fire': 'fire',
  'earth': 'earth',
  'wind': 'wind',
  'divine': 'divine',
};

const RACE_TEXT_TO_ID: Record<string, Race> = {
  "魔法使い族": "spellcaster",
  "ドラゴン族": "dragon",
  "アンデット族": "zombie",
  "戦士族": "warrior",
  "獣戦士族": "beastwarrior",
  "獣族": "beast",
  "鳥獣族": "windbeast",
  "悪魔族": "fiend",
  "天使族": "fairy",
  "昆虫族": "insect",
  "恐竜族": "dinosaur",
  "爬虫類族": "reptile",
  "魚族": "fish",
  "海竜族": "seaserpent",
  "水族": "aqua",
  "炎族": "pyro",
  "雷族": "thunder",
  "岩石族": "rock",
  "植物族": "plant",
  "機械族": "machine",
  "サイキック族": "psychic",
  "幻神獣族": "divine",
  "創造神族": "creatorgod",
  "幻竜族": "wyrm",
  "サイバース族": "cyberse",
  "幻想魔族": "illusion"
};

const MONSTER_TYPE_TEXT_TO_ID: Record<string, MonsterType> = {
  "通常": "normal",
  "効果": "effect",
  "儀式": "ritual",
  "融合": "fusion",
  "シンクロ": "synchro",
  "エクシーズ": "xyz",
  "トゥーン": "toon",
  "スピリット": "spirit",
  "ユニオン": "union",
  "デュアル": "gemini",
  "チューナー": "tuner",
  "リバース": "flip",
  "ペンデュラム": "pendulum",
  "特殊召喚": "special",
  "リンク": "link"
};

const SPELL_EFFECT_PATH_TO_ID: Record<string, SpellEffectType> = {
  'quickplay': 'quick',
  'continuous': 'continuous',
  'equip': 'equip',
  'field': 'field',
  'ritual': 'ritual',
};

const TRAP_EFFECT_PATH_TO_ID: Record<string, TrapEffectType> = {
  'continuous': 'continuous',
  'counter': 'counter',
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

function normalizeForSearch(str: string): string {
  if (!str) return ''
  return str
    .replace(/[\s\u3000]+/g, '')
    .replace(/[・★☆※‼！？。、,.，．:：;；「」『』【】〔〕（）()［］\[\]｛｝{}〈〉《》〜～~\-－_＿\/／\\＼|｜&＆@＠#＃$＄%％^＾*＊+＋=＝<＜>＞'"\"'""''`´｀]/g, '')
    .replace(/竜/g, '龍')
    .replace(/剣/g, '劍')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (s) => String.fromCharCode(s.charCodeAt(0) + 0x60))
}

function parseLinkValue(linkValue: string): number {
  let result = 0;
  for (const char of linkValue) {
    const direction = parseInt(char, 10);
    if (direction >= 1 && direction <= 9 && direction !== 5) {
      const bitPos = direction - 1;
      result |= (1 << bitPos);
    }
  }
  return result;
}

// ============================================================================
// パーサー関数
// ============================================================================

/**
 * DOM要素からカードタイプを検出する
 */
function detectCardType(row: Element): CardType | null {
  const img = row.querySelector('.box_card_attribute img') as HTMLImageElement | null;
  if (!img) return null;

  const src = img.src || '';
  if (!src) return null;

  if (src.includes('attribute_icon_spell')) {
    return 'spell';
  } else if (src.includes('attribute_icon_trap')) {
    return 'trap';
  } else if (src.includes('attribute_icon_')) {
    return 'monster';
  }

  return null;
}

/**
 * モンスターがエクストラデッキに入るかどうかを判定する
 */
function isExtraDeckMonster(row: Element): boolean {
  const levelRankElem = row.querySelector('.box_card_level_rank');

  if (levelRankElem) {
    const img = levelRankElem.querySelector('img') as HTMLImageElement | null;
    if (img && img.src.includes('icon_rank.png')) {
      return true;
    }
  } else {
    const cardType = detectCardType(row);
    if (cardType === 'monster') {
      return true;
    }
  }

  const speciesElem = row.querySelector('.card_info_species_and_other_item');
  if (speciesElem) {
    const speciesText = speciesElem.textContent || '';
    if (speciesText.includes('融合') || speciesText.includes('シンクロ')) {
      return true;
    }
  }

  return false;
}

/**
 * HTMLから画像URL情報を抽出
 */
export function extractImageInfo(doc: Document): Map<string, { ciid?: string; imgHash?: string }> {
  const imageInfoMap = new Map<string, { ciid?: string; imgHash?: string }>();
  const htmlText = doc.documentElement.innerHTML;
  const regex = /get_image\.action\?[^'"]*cid=(\d+)(?:&(?:amp;)?ciid=(\d+))?(?:&(?:amp;)?enc=([^&'"\s]+))?/g;
  let match;

  while ((match = regex.exec(htmlText)) !== null) {
    const cid = match[1];
    if (!cid) continue;
    const ciid = match[2] || undefined;
    const imgHash = match[3] || undefined;
    imageInfoMap.set(cid, { ciid, imgHash });
  }

  return imageInfoMap;
}

/**
 * カード基本情報を抽出
 */
function parseCardBase(row: Element, imageInfoMap: Map<string, { ciid?: string; imgHash?: string }>): CardBase | null {
  const nameElem = row.querySelector('.card_name');
  if (!nameElem?.textContent) return null;
  const name = nameElem.textContent.trim();

  const linkValueInput = row.querySelector('input.link_value') as HTMLInputElement | null;
  if (!linkValueInput?.value) return null;

  const match = linkValueInput.value.match(/[?&]cid=(\d+)/);
  if (!match || !match[1]) return null;
  const cardId = match[1];

  const rubyElem = row.querySelector('.card_ruby');
  const ruby = rubyElem?.textContent?.trim() || undefined;

  const imageInfo = imageInfoMap.get(cardId);
  const ciid = imageInfo?.ciid || '1';
  const imgHash = imageInfo?.imgHash || `${cardId}_1_1_1`;
  const imgs = [{ciid, imgHash}];

  const textElem = row.querySelector('.box_card_text');
  let text: string | undefined = undefined;
  if (textElem) {
    const cloned = textElem.cloneNode(true) as Element;
    cloned.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });
    text = cloned.textContent?.trim() || undefined;
  }

  let limitRegulation: LimitRegulation | undefined = undefined;
  const lrIconElem = row.querySelector('.lr_icon');
  if (lrIconElem) {
    if (lrIconElem.classList.contains('fl_1')) {
      limitRegulation = 'forbidden';
    } else if (lrIconElem.classList.contains('fl_2')) {
      limitRegulation = 'limited';
    } else if (lrIconElem.classList.contains('fl_3')) {
      limitRegulation = 'semi-limited';
    }
  }

  // biko（備考）情報を取得
  let biko: string | undefined = undefined;
  let isNotLegalForOfficial = false;
  const bikoElem = row.querySelector('.box_card_text.biko');
  if (bikoElem) {
    const cloned = bikoElem.cloneNode(true) as Element;
    // <hr>タグを削除
    cloned.querySelectorAll('hr').forEach(hr => hr.remove());
    cloned.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });
    const bikoText = cloned.textContent?.trim() || '';
    if (bikoText) {
      biko = bikoText;
      // 公式デュエルで使用できないかどうかを判定
      if (bikoText.includes('公式のデュエルでは使用できません') ||
          bikoText.includes('公式大会で使用できません') ||
          bikoText.toLowerCase().includes('cannot be used in official') ||
          bikoText.toLowerCase().includes('not legal for official')) {
        isNotLegalForOfficial = true;
      }
    }
  }

  return {
    name,
    ruby,
    cardId,
    ciid,
    imgs,
    text,
    limitRegulation,
    biko,
    isNotLegalForOfficial
  };
}

/**
 * 種族・タイプ情報をパース
 */
function parseSpeciesAndTypes(speciesText: string): { race: Race; types: MonsterType[] } | null {
  const cleaned = speciesText.replace(/【|】|\[|\]/g, '').trim();
  const parts = cleaned.split('／').map(p => p.trim()).filter(p => p);

  if (parts.length === 0) return null;

  const raceText = parts[0];
  if (!raceText) return null;
  const typeTexts = parts.slice(1);

  const race = RACE_TEXT_TO_ID[raceText];
  if (!race) return null;

  const types: MonsterType[] = [];
  for (const typeText of typeTexts) {
    const type = MONSTER_TYPE_TEXT_TO_ID[typeText];
    if (type) {
      types.push(type);
    }
  }

  return { race, types };
}

/**
 * モンスターカード固有情報を抽出
 */
function parseMonsterCard(row: Element, base: CardBase): MonsterCard | null {
  let extractedLinkValue: string | null = null;

  const attrImg = row.querySelector('.box_card_attribute img') as HTMLImageElement | null;
  if (!attrImg?.src) return null;

  const attrMatch = attrImg.src.match(/attribute_icon_([^.]+)\.png/);
  if (!attrMatch || !attrMatch[1]) return null;
  const attrPath = attrMatch[1];

  const attribute = ATTRIBUTE_PATH_TO_ID[attrPath];
  if (!attribute) return null;

  const levelRankElem = row.querySelector('.box_card_level_rank');
  const linkMarkerElem = row.querySelector('.box_card_linkmarker');
  let levelType: LevelType;
  let levelValue: number;

  if (levelRankElem) {
    if (levelRankElem.classList.contains('level')) {
      levelType = 'level';
    } else if (levelRankElem.classList.contains('rank')) {
      levelType = 'rank';
    } else {
      levelType = 'level';
    }

    const levelImg = levelRankElem.querySelector('img') as HTMLImageElement | null;
    if (levelImg?.src) {
      if (levelImg.src.includes('icon_rank.png')) {
        levelType = 'rank';
      } else if (levelImg.src.includes('icon_level.png')) {
        levelType = 'level';
      }
    }

    const levelSpan = levelRankElem.querySelector('span');
    if (levelSpan?.textContent) {
      const match = levelSpan.textContent.match(/\d+/);
      if (match) {
        levelValue = parseInt(match[0], 10);
      } else {
        return null;
      }
    } else {
      return null;
    }
  } else if (linkMarkerElem) {
    levelType = 'link';

    const linkSpan = linkMarkerElem.querySelector('span');
    if (linkSpan?.textContent) {
      const match = linkSpan.textContent.match(/\d+/);
      if (match) {
        levelValue = parseInt(match[0], 10);
      } else {
        return null;
      }
    } else {
      return null;
    }

    const linkImg = linkMarkerElem.querySelector('img') as HTMLImageElement | null;
    if (linkImg?.src) {
      const linkMatch = linkImg.src.match(/link(\d+)\.png/);
      if (linkMatch && linkMatch[1]) {
        extractedLinkValue = linkMatch[1];
      }
    }
  } else {
    return null;
  }

  const speciesElem = row.querySelector('.card_info_species_and_other_item');
  if (!speciesElem?.textContent) return null;

  const parsed = parseSpeciesAndTypes(speciesElem.textContent);
  if (!parsed) return null;
  const { race, types } = parsed;

  const specElem = row.querySelector('.box_card_spec');
  let atk: number | string | undefined;
  let def: number | string | undefined;

  if (specElem) {
    const spans = Array.from(specElem.querySelectorAll('span'));
    spans.forEach(span => {
      const text = span.textContent || '';

      const atkMatch = text.match(/攻撃力[:\s]*([0-9X?]+)/);
      if (atkMatch && atkMatch[1]) {
        const value = atkMatch[1];
        atk = /^\d+$/.test(value) ? parseInt(value, 10) : value;
      }

      const defMatch = text.match(/守備力[:\s]*([0-9X?]+)/);
      if (defMatch && defMatch[1]) {
        const value = defMatch[1];
        def = /^\d+$/.test(value) ? parseInt(value, 10) : value;
      }
    });
  }

  let pendulumScale: number | undefined;
  let pendulumText: string | undefined;

  const pendulumScaleElem = row.querySelector('.box_card_pen_scale');
  if (pendulumScaleElem?.textContent) {
    const match = pendulumScaleElem.textContent.match(/\d+/);
    if (match) {
      pendulumScale = parseInt(match[0], 10);
    }
  }

  const pendulumEffectElem = row.querySelector('.box_card_pen_effect');
  if (pendulumEffectElem) {
    const cloned = pendulumEffectElem.cloneNode(true) as Element;
    cloned.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });
    pendulumText = cloned.textContent?.trim();
  }

  let linkMarkers: number | undefined;
  if (levelType === 'link' && extractedLinkValue) {
    linkMarkers = parseLinkValue(extractedLinkValue);
  }

  const isExtraDeck = isExtraDeckMonster(row);

  return {
    ...base,
    cardType: 'monster',
    attribute,
    levelType,
    levelValue,
    race,
    monsterTypes: types,
    atk,
    def,
    linkMarkers,
    pendulumScale,
    pendulumText,
    isExtraDeck
  };
}

/**
 * 魔法カード固有情報を抽出
 */
function parseSpellCard(row: Element, base: CardBase): SpellCard | null {
  const attrImg = row.querySelector('.box_card_attribute img') as HTMLImageElement | null;
  if (!attrImg?.src?.includes('attribute_icon_spell')) return null;

  const effectElem = row.querySelector('.box_card_effect');
  let effectType: SpellEffectType | undefined = undefined;

  if (effectElem) {
    const effectImg = effectElem.querySelector('img') as HTMLImageElement | null;
    if (effectImg?.src) {
      const match = effectImg.src.match(/effect_icon_([^.]+)\.png/);
      if (match && match[1]) {
        effectType = SPELL_EFFECT_PATH_TO_ID[match[1]];
      }
    }
  }

  if (!effectType) {
    effectType = 'normal';
  }

  return {
    ...base,
    cardType: 'spell',
    effectType
  };
}

/**
 * 罠カード固有情報を抽出
 */
function parseTrapCard(row: Element, base: CardBase): TrapCard | null {
  const attrImg = row.querySelector('.box_card_attribute img') as HTMLImageElement | null;
  if (!attrImg?.src?.includes('attribute_icon_trap')) return null;

  const effectElem = row.querySelector('.box_card_effect');
  let effectType: TrapEffectType | undefined = undefined;

  if (effectElem) {
    const effectImg = effectElem.querySelector('img') as HTMLImageElement | null;
    if (effectImg?.src) {
      const match = effectImg.src.match(/effect_icon_([^.]+)\.png/);
      if (match && match[1]) {
        effectType = TRAP_EFFECT_PATH_TO_ID[match[1]];
      }
    }
  }

  if (!effectType) {
    effectType = 'normal';
  }

  return {
    ...base,
    cardType: 'trap',
    effectType
  };
}

/**
 * CardInfo型をexport
 */
export type CardInfo = MonsterCard | SpellCard | TrapCard;

/**
 * 検索結果の行からカード情報を抽出
 */
export function parseSearchResultRow(
  row: Element,
  imageInfoMap: Map<string, { ciid?: string; imgHash?: string }>
): CardInfo | null {
  const base = parseCardBase(row, imageInfoMap);
  if (!base) return null;

  const cardType = detectCardType(row);
  if (!cardType) return null;

  switch (cardType) {
    case 'monster':
      return parseMonsterCard(row, base);
    case 'spell':
      return parseSpellCard(row, base);
    case 'trap':
      return parseTrapCard(row, base);
    default:
      return null;
  }
}

// ============================================================================
// TSV出力関数
// ============================================================================

/**
 * TSV用にエスケープ
 */
function escapeForTsv(value: string): string {
  if (!value) return '';
  return value
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * CardInfoをTSV行に変換
 */
function cardInfoToTsvRow(card: CardInfo): string {
  const fields: string[] = [];

  // 共通フィールド
  fields.push(escapeForTsv(card.cardType));
  fields.push(escapeForTsv(card.name));
  fields.push(escapeForTsv(normalizeForSearch(card.name)));
  fields.push(escapeForTsv(card.ruby || ''));
  fields.push(escapeForTsv(card.cardId));
  fields.push(escapeForTsv(card.ciid));
  fields.push(escapeForTsv(JSON.stringify(card.imgs)));
  fields.push(escapeForTsv(card.text || ''));
  fields.push(escapeForTsv(card.biko || ''));
  fields.push(escapeForTsv(card.isNotLegalForOfficial.toString()));

  // カードタイプ別フィールド
  if (card.cardType === 'monster') {
    const monster = card as MonsterCard;
    fields.push(escapeForTsv(monster.attribute));
    fields.push(escapeForTsv(monster.levelType));
    fields.push(escapeForTsv(monster.levelValue.toString()));
    fields.push(escapeForTsv(monster.race));
    fields.push(escapeForTsv(JSON.stringify(monster.monsterTypes)));
    fields.push(escapeForTsv(monster.atk !== undefined ? monster.atk.toString() : ''));
    fields.push(escapeForTsv(monster.def !== undefined ? monster.def.toString() : ''));
    fields.push(escapeForTsv(monster.linkMarkers !== undefined ? monster.linkMarkers.toString() : ''));
    fields.push(escapeForTsv(monster.pendulumScale !== undefined ? monster.pendulumScale.toString() : ''));
    fields.push(escapeForTsv(monster.pendulumText || ''));
    fields.push(escapeForTsv(monster.isExtraDeck.toString()));
    fields.push(''); // spellEffectType
    fields.push(''); // trapEffectType
  } else if (card.cardType === 'spell') {
    const spell = card as SpellCard;
    fields.push(''); // attribute
    fields.push(''); // levelType
    fields.push(''); // levelValue
    fields.push(''); // race
    fields.push(''); // monsterTypes
    fields.push(''); // atk
    fields.push(''); // def
    fields.push(''); // linkMarkers
    fields.push(''); // pendulumScale
    fields.push(''); // pendulumText
    fields.push(''); // isExtraDeck
    fields.push(escapeForTsv(spell.effectType || ''));
    fields.push(''); // trapEffectType
  } else if (card.cardType === 'trap') {
    const trap = card as TrapCard;
    fields.push(''); // attribute
    fields.push(''); // levelType
    fields.push(''); // levelValue
    fields.push(''); // race
    fields.push(''); // monsterTypes
    fields.push(''); // atk
    fields.push(''); // def
    fields.push(''); // linkMarkers
    fields.push(''); // pendulumScale
    fields.push(''); // pendulumText
    fields.push(''); // isExtraDeck
    fields.push(''); // spellEffectType
    fields.push(escapeForTsv(trap.effectType || ''));
  }

  return fields.join('\t');
}

/**
 * TSVヘッダー行を生成
 */
function getTsvHeader(): string {
  return [
    'cardType',
    'name',
    'nameModified',
    'ruby',
    'cardId',
    'ciid',
    'imgs',
    'text',
    'biko',
    'isNotLegalForOfficial',
    // モンスター用フィールド
    'attribute',
    'levelType',
    'levelValue',
    'race',
    'monsterTypes',
    'atk',
    'def',
    'linkMarkers',
    'pendulumScale',
    'pendulumText',
    'isExtraDeck',
    // 魔法・罠用フィールド
    'spellEffectType',
    'trapEffectType'
  ].join('\t');
}

// ============================================================================
// メイン処理
// ============================================================================

async function main() {
  console.log('=== Starting TSV generation ===\n');

  const cardsDir = path.join(__dirname, 'cards');
  const outputDir = path.join(__dirname, '../..', 'output', 'data');
  const outputPath = path.join(outputDir, 'cards-all.tsv');

  // 出力ディレクトリを作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const allCards: CardInfo[] = [];

  // 全10ページを処理
  for (let page = 1; page <= 10; page++) {
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
    const doc = dom.window.document;

    // 画像情報を抽出
    const imageInfoMap = extractImageInfo(doc);
    console.log(`  Extracted image info for ${imageInfoMap.size} cards`);

    // カード行を取得
    const rows = doc.querySelectorAll('.t_row');
    console.log(`  Found ${rows.length} card rows`);

    // 各行をパース
    let successCount = 0;
    rows.forEach((row) => {
      const card = parseSearchResultRow(row, imageInfoMap);
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

  console.log(`Done! TSV file created: ${outputPath}`);
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
  console.log('\nDone!');
}

// 直接実行時のみmainを実行
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

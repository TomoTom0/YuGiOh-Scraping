import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { parseSearchResultRow, extractImageInfo } from './parse-to-tsv';
import { parseScrapingMode, type ScrapingMode } from '../utils/helpers.js';

// ============================================================================
// 設定
// ============================================================================

const CONFIG = {
  BASE_URL: 'https://www.db.yugioh-card.com/yugiohdb/card_search.action',
  RESULTS_PER_PAGE: 100, // 増分取得では少なめに
  SORT_NEWER: 21, // 発売日(新しい順)
  LOCALE: 'ja',
  DELAY_MS: 1000, // リクエスト間隔
};

// ============================================================================
// 型定義
// ============================================================================

interface FetchResult {
  newCards: CardInfo[];
  stoppedAt: string | null;
  totalFetched: number;
  pagesProcessed: number;
}

// parse-to-tsvからCardInfo型を再定義（exportされていないため）
type CardInfo = ReturnType<typeof parseSearchResultRow> & {};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 指定ミリ秒待機
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 既存TSVからcardIdセットを読み込む
 */
function loadExistingCardIds(tsvPath: string): Set<string> {
  const cardIds = new Set<string>();

  if (!fs.existsSync(tsvPath)) {
    console.log(`既存TSVファイルが見つかりません: ${tsvPath}`);
    return cardIds;
  }

  const content = fs.readFileSync(tsvPath, 'utf8');
  const lines = content.split('\n');

  // ヘッダーをスキップ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = line.split('\t');
    // cardIdは5番目のフィールド（0-indexed: 4）
    const cardId = fields[4];
    if (cardId) {
      cardIds.add(cardId);
    }
  }

  console.log(`既存TSVから ${cardIds.size} 件のcardIdを読み込みました`);
  return cardIds;
}

/**
 * HTMLをフェッチ
 */
async function fetchPage(page: number): Promise<string> {
  const pageParam = page > 1 ? `&page=${page}` : '';
  const url = `${CONFIG.BASE_URL}?ope=1&sess=1&rp=${CONFIG.RESULTS_PER_PAGE}&mode=&sort=${CONFIG.SORT_NEWER}&keyword=&stype=1&othercon=2&request_locale=${CONFIG.LOCALE}${pageParam}`;

  console.log(`  フェッチ中: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.text();
}

/**
 * HTMLからカード情報を抽出
 */
function parseCardsFromHtml(html: string): CardInfo[] {
  const dom = new JSDOM(html, {
    url: CONFIG.BASE_URL
  });
  const doc = dom.window.document;

  const imageInfoMap = extractImageInfo(doc);
  const rows = doc.querySelectorAll('.t_row');
  const cards: CardInfo[] = [];

  rows.forEach((row) => {
    const card = parseSearchResultRow(row, imageInfoMap);
    if (card) {
      cards.push(card);
    }
  });

  return cards;
}

/**
 * 新しい方から指定件数を取得
 */
async function fetchTopN(n: number): Promise<FetchResult> {
  const newCards: CardInfo[] = [];
  let totalFetched = 0;
  let page = 1;

  console.log(`新しい方から ${n} 件取得\n`);

  while (newCards.length < n) {
    console.log(`ページ ${page} を処理中...`);

    try {
      const html = await fetchPage(page);
      const cards = parseCardsFromHtml(html);

      if (cards.length === 0) {
        console.log('  カードが見つかりませんでした。終了します。');
        break;
      }

      console.log(`  ${cards.length} 件のカードを取得`);
      totalFetched += cards.length;

      // 必要な件数まで追加
      const remaining = n - newCards.length;
      const toAdd = cards.slice(0, remaining);
      newCards.push(...toAdd);

      console.log(`  追加: ${toAdd.length} 件 (合計: ${newCards.length}/${n})`);

      if (newCards.length >= n) {
        break;
      }

      // 次のページがあるかチェック
      if (cards.length < CONFIG.RESULTS_PER_PAGE) {
        console.log('  最終ページに到達しました。');
        break;
      }

      page++;
      await sleep(CONFIG.DELAY_MS);

    } catch (error) {
      console.error(`  エラー: ${error}`);
      break;
    }
  }

  return {
    newCards,
    stoppedAt: null,
    totalFetched,
    pagesProcessed: page
  };
}

/**
 * 指定範囲を取得 (start位置からlength件)
 */
async function fetchRange(start: number, length: number): Promise<FetchResult> {
  const newCards: CardInfo[] = [];
  let totalFetched = 0;
  let currentIndex = 0;
  let page = 1;

  console.log(`範囲取得: ${start}番目から${length}件 (${start} ~ ${start + length - 1})\n`);

  while (newCards.length < length) {
    console.log(`ページ ${page} を処理中...`);

    try {
      const html = await fetchPage(page);
      const cards = parseCardsFromHtml(html);

      if (cards.length === 0) {
        console.log('  カードが見つかりませんでした。終了します。');
        break;
      }

      console.log(`  ${cards.length} 件のカードを取得`);
      totalFetched += cards.length;

      // 各カードをチェック
      for (const card of cards) {
        // start位置より前はスキップ
        if (currentIndex < start) {
          currentIndex++;
          continue;
        }

        // 必要な件数に達したら終了
        if (newCards.length >= length) {
          break;
        }

        newCards.push(card);
        currentIndex++;
      }

      console.log(`  追加: (合計: ${newCards.length}/${length})`);

      if (newCards.length >= length) {
        break;
      }

      // 次のページがあるかチェック
      if (cards.length < CONFIG.RESULTS_PER_PAGE) {
        console.log('  最終ページに到達しました。');
        break;
      }

      page++;
      await sleep(CONFIG.DELAY_MS);

    } catch (error) {
      console.error(`  エラー: ${error}`);
      break;
    }
  }

  return {
    newCards,
    stoppedAt: null,
    totalFetched,
    pagesProcessed: page
  };
}

/**
 * 増分取得を実行
 */
async function fetchIncremental(existingCardIds: Set<string>): Promise<FetchResult> {
  const newCards: CardInfo[] = [];
  let stoppedAt: string | null = null;
  let totalFetched = 0;
  let page = 1;
  let shouldStop = false;

  console.log('\n=== 増分取得開始 ===\n');

  while (!shouldStop) {
    console.log(`ページ ${page} を処理中...`);

    try {
      const html = await fetchPage(page);
      const cards = parseCardsFromHtml(html);

      if (cards.length === 0) {
        console.log('  カードが見つかりませんでした。終了します。');
        break;
      }

      console.log(`  ${cards.length} 件のカードを取得`);
      totalFetched += cards.length;

      // 各カードをチェック
      let newInPage = 0;
      for (const card of cards) {
        if (existingCardIds.has(card.cardId)) {
          // 既存カードが見つかった = ここで停止
          console.log(`  既存カード検出: ${card.name} (cardId: ${card.cardId})`);
          stoppedAt = card.cardId;
          shouldStop = true;
          break;
        } else {
          newCards.push(card);
          newInPage++;
        }
      }

      console.log(`  新規カード: ${newInPage} 件`);

      if (!shouldStop) {
        // 次のページがあるかチェック
        if (cards.length < CONFIG.RESULTS_PER_PAGE) {
          console.log('  最終ページに到達しました。');
          break;
        }

        page++;
        await sleep(CONFIG.DELAY_MS);
      }

    } catch (error) {
      console.error(`  エラー: ${error}`);
      break;
    }
  }

  return {
    newCards,
    stoppedAt,
    totalFetched,
    pagesProcessed: page
  };
}

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
 * 検索用に文字列を正規化
 */
function normalizeForSearch(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\s\u3000]+/g, '')
    .replace(/[・★☆※‼！？。、,.，．:：;；「」『』【】〔〕（）()［］\[\]｛｝{}〈〉《》〜～~\-－_＿\/／\\＼|｜&＆@＠#＃$＄%％^＾*＊+＋=＝<＜>＞'"\"'""''`´｀]/g, '')
    .replace(/竜/g, '龍')
    .replace(/剣/g, '劍')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (s) => String.fromCharCode(s.charCodeAt(0) + 0x60));
}

/**
 * CardInfoをTSV行に変換
 */
function cardInfoToTsvRow(card: any): string {
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
    fields.push(escapeForTsv(card.attribute));
    fields.push(escapeForTsv(card.levelType));
    fields.push(escapeForTsv(card.levelValue.toString()));
    fields.push(escapeForTsv(card.race));
    fields.push(escapeForTsv(JSON.stringify(card.monsterTypes)));
    fields.push(escapeForTsv(card.atk !== undefined ? card.atk.toString() : ''));
    fields.push(escapeForTsv(card.def !== undefined ? card.def.toString() : ''));
    fields.push(escapeForTsv(card.linkMarkers !== undefined ? card.linkMarkers.toString() : ''));
    fields.push(escapeForTsv(card.pendulumScale !== undefined ? card.pendulumScale.toString() : ''));
    fields.push(escapeForTsv(card.pendulumText || ''));
    fields.push(escapeForTsv(card.isExtraDeck.toString()));
  } else if (card.cardType === 'spell') {
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
    fields.push(escapeForTsv(card.effectType || ''));
  } else if (card.cardType === 'trap') {
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
    fields.push(escapeForTsv(card.effectType || ''));
  }

  return fields.join('\t');
}

/**
 * 新規カードを既存TSVにマージ（重複排除・ID順ソート）
 */
function mergeToTsv(newCards: CardInfo[], tsvPath: string): void {
  if (newCards.length === 0) {
    console.log('マージするカードがありません。');
    return;
  }

  const header = [
    'cardType', 'name', 'nameModified', 'ruby', 'cardId', 'ciid', 'imgs', 'text',
    'biko', 'isNotLegalForOfficial',
    'attribute', 'levelType', 'levelValue', 'race', 'monsterTypes',
    'atk', 'def', 'linkMarkers', 'pendulumScale', 'pendulumText', 'isExtraDeck',
    'spellEffectType', 'trapEffectType'
  ].join('\t');

  // cardIdをキーとしたMapを作成
  const cardMap = new Map<string, string>();

  // 既存データを読み込み
  if (fs.existsSync(tsvPath)) {
    const existingContent = fs.readFileSync(tsvPath, 'utf8');
    const lines = existingContent.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const fields = line.split('\t');
      const cardId = fields[4]; // cardIdは5番目のフィールド
      if (cardId) {
        cardMap.set(cardId, line);
      }
    }
  }

  // 新規カードで上書き（新しいデータが優先）
  for (const card of newCards) {
    const line = cardInfoToTsvRow(card);
    cardMap.set(card.cardId, line);
  }

  // cardIdを数値として降順ソート（新しいカードが上）
  const sortedLines = Array.from(cardMap.entries())
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([id, line]) => line);

  // ファイルに書き込み
  const output = [header, ...sortedLines].join('\n');
  fs.writeFileSync(tsvPath, output, 'utf8');

  console.log(`${newCards.length} 件のカードをマージしました（合計: ${cardMap.size} 件、重複排除・ソート済み）`);
}

// ============================================================================
// メイン処理
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const mode = parseScrapingMode(args);

  const scriptsDir = __dirname;
  const outputDir = path.join(scriptsDir, '../..', 'output', 'data');
  const tsvPath = path.join(outputDir, 'cards-all.tsv');

  // 出力ディレクトリ作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let result: FetchResult;

  if (mode.type === 'top') {
    console.log(`=== カードデータ 新しい方から${mode.count}件取得 ===\n`);
    result = await fetchTopN(mode.count);
  } else if (mode.type === 'range') {
    console.log(`=== カードデータ 範囲指定取得 (${mode.start}番目から${mode.length}件) ===\n`);
    result = await fetchRange(mode.start, mode.length);
  } else if (mode.type === 'incremental') {
    console.log('=== カードデータ増分取得 ===\n');
    const existingCardIds = loadExistingCardIds(tsvPath);
    result = await fetchIncremental(existingCardIds);
  } else {
    console.error('エラー: cards-dataでは --ids オプションはサポートされていません');
    process.exit(1);
  }

  console.log('\n=== 取得結果 ===');
  console.log(`処理ページ数: ${result.pagesProcessed}`);
  console.log(`取得カード総数: ${result.totalFetched}`);
  console.log(`新規カード数: ${result.newCards.length}`);
  if (result.stoppedAt) {
    console.log(`停止位置 (既存cardId): ${result.stoppedAt}`);
  }

  // マージ
  if (result.newCards.length > 0) {
    console.log('\n=== TSVにマージ中 ===');
    mergeToTsv(result.newCards, tsvPath);
  }

  console.log('\n=== 完了 ===');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

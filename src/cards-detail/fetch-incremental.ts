import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { establishSession } from '../utils/session.js';
import { fetchCardDetail, type CardDetail } from '../utils/fetchers.js';
import { escapeForTsv } from '../utils/formatters.js';
import { sleep, parseScrapingMode } from '../utils/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// 設定
// ============================================================================

const CONFIG = {
  DELAY_MIN_MS: 1000,
  DELAY_MAX_MS: 3000,
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * ランダム遅延（1000-3000ms）
 */
function randomDelay(): Promise<void> {
  const delay = Math.floor(Math.random() * (CONFIG.DELAY_MAX_MS - CONFIG.DELAY_MIN_MS + 1)) + CONFIG.DELAY_MIN_MS;
  console.log(`  待機: ${delay}ms`);
  return sleep(delay);
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
    const cardId = fields[0]; // cardIdは1番目のフィールド
    if (cardId) {
      cardIds.add(cardId);
    }
  }

  console.log(`既存TSVから ${cardIds.size} 件のcardIdを読み込みました`);
  return cardIds;
}

/**
 * cards-all.tsvから全cardIdを読み込む
 */
function loadAllCardIds(cardsPath: string): string[] {
  if (!fs.existsSync(cardsPath)) {
    console.error(`cards-all.tsvが見つかりません: ${cardsPath}`);
    return [];
  }

  const content = fs.readFileSync(cardsPath, 'utf8');
  const lines = content.split('\n');
  const cardIds: string[] = [];

  // ヘッダー行からcardIdのインデックスを特定
  const header = lines[0];
  const headerFields = header.split('\t');
  const cardIdIndex = headerFields.indexOf('cardId');

  if (cardIdIndex === -1) {
    console.error('cardIdカラムが見つかりません');
    return [];
  }

  // ヘッダーをスキップ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = line.split('\t');
    const cardId = fields[cardIdIndex];
    if (cardId) {
      cardIds.push(cardId);
    }
  }

  return cardIds;
}

/**
 * 新しい方から指定件数を取得
 */
async function fetchTopN(n: number, cardsPath: string, cookieJar: string): Promise<CardDetail[]> {
  const allCardIds = loadAllCardIds(cardsPath);
  
  if (allCardIds.length === 0) {
    console.error('カードIDが見つかりません。');
    return [];
  }

  // 新しい順に並んでいるので、先頭からN件を取得
  const topCardIds = allCardIds.slice(0, Math.min(n, allCardIds.length));
  
  console.log(`新しい方から ${topCardIds.length} 件取得\n`);

  const cards: CardDetail[] = [];
  let successCount = 0;
  let errorCount = 0;
  let supplementCount = 0;
  let pendulumSupplementCount = 0;

  for (let i = 0; i < topCardIds.length; i++) {
    const cardId = topCardIds[i];
    const progress = `[${i + 1}/${topCardIds.length}]`;

    process.stdout.write(`\r${progress} 取得中: ${cardId}...`);

    const cardDetail = await fetchCardDetail(cardId, cookieJar);

    if (cardDetail) {
      cards.push(cardDetail);
      successCount++;
      if (cardDetail.supplementInfo) supplementCount++;
      if (cardDetail.pendulumSupplementInfo) pendulumSupplementCount++;
    } else {
      errorCount++;
    }

    if (i < topCardIds.length - 1) {
      await randomDelay();
    }
  }

  console.log(`\n\n取得完了: 成功=${successCount}, エラー=${errorCount}`);
  console.log(`補足情報あり: ${supplementCount}`);
  console.log(`P補足情報あり: ${pendulumSupplementCount}`);

  return cards;
}

/**
 * 指定範囲を取得 (start位置からlength件)
 */
async function fetchRange(start: number, length: number, cardsPath: string, cookieJar: string): Promise<CardDetail[]> {
  const allCardIds = loadAllCardIds(cardsPath);
  
  if (allCardIds.length === 0) {
    console.error('カードIDが見つかりません。');
    return [];
  }

  // 範囲を取得
  const rangeCardIds = allCardIds.slice(start, start + length);
  
  console.log(`範囲取得: ${start}番目から${rangeCardIds.length}件 (${start} ~ ${start + rangeCardIds.length - 1})\n`);

  const cards: CardDetail[] = [];
  let successCount = 0;
  let errorCount = 0;
  let supplementCount = 0;
  let pendulumSupplementCount = 0;

  for (let i = 0; i < rangeCardIds.length; i++) {
    const cardId = rangeCardIds[i];
    const progress = `[${i + 1}/${rangeCardIds.length}]`;

    process.stdout.write(`\r${progress} 取得中: ${cardId}...`);

    const cardDetail = await fetchCardDetail(cardId, cookieJar);

    if (cardDetail) {
      cards.push(cardDetail);
      successCount++;
      if (cardDetail.supplementInfo) supplementCount++;
      if (cardDetail.pendulumSupplementInfo) pendulumSupplementCount++;
    } else {
      errorCount++;
    }

    if (i < rangeCardIds.length - 1) {
      await randomDelay();
    }
  }

  console.log(`\n\n取得完了: 成功=${successCount}, エラー=${errorCount}`);
  console.log(`補足情報あり: ${supplementCount}`);
  console.log(`P補足情報あり: ${pendulumSupplementCount}`);

  return cards;
}

/**
 * 指定されたcardIdリストを取得
 */
async function fetchSpecificCardIds(cardIds: string[], cookieJar: string): Promise<CardDetail[]> {
  const cards: CardDetail[] = [];
  let successCount = 0;
  let errorCount = 0;
  let supplementCount = 0;
  let pendulumSupplementCount = 0;

  console.log(`\n=== 指定カード詳細の取得 (${cardIds.length}件) ===\n`);

  for (let i = 0; i < cardIds.length; i++) {
    const cardId = cardIds[i];
    const progress = `[${i + 1}/${cardIds.length}]`;

    process.stdout.write(`\r${progress} 取得中: ${cardId}...`);

    const cardDetail = await fetchCardDetail(cardId, cookieJar);

    if (cardDetail) {
      cards.push(cardDetail);
      successCount++;
      if (cardDetail.supplementInfo) supplementCount++;
      if (cardDetail.pendulumSupplementInfo) pendulumSupplementCount++;
    } else {
      errorCount++;
    }

    if (i < cardIds.length - 1) {
      await randomDelay();
    }
  }

  console.log(`\n\n取得完了: 成功=${successCount}, エラー=${errorCount}`);
  console.log(`補足情報あり: ${supplementCount}`);
  console.log(`P補足情報あり: ${pendulumSupplementCount}`);

  return cards;
}

/**
 * カード情報をTSVに書き込み（重複排除・ID順ソート）
 */
function updateTsv(cards: CardDetail[], tsvPath: string, messagePrefix: string = ''): void {
  if (cards.length === 0) {
    console.log(`${messagePrefix}更新またはマージするカードがありません。`);
    return;
  }

  const header = [
    'cardId', 'cardName', 'supplementInfo', 'supplementDate',
    'pendulumSupplementInfo', 'pendulumSupplementDate'
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
      const cardId = fields[0];
      if (cardId) {
        cardMap.set(cardId, line);
      }
    }
  }

  // 取得したカードで上書き（新しいデータが優先）
  for (const card of cards) {
    const line = [
      card.cardId,
      escapeForTsv(card.cardName),
      escapeForTsv(card.supplementInfo),
      escapeForTsv(card.supplementDate),
      escapeForTsv(card.pendulumSupplementInfo),
      escapeForTsv(card.pendulumSupplementDate)
    ].join('\t');
    cardMap.set(card.cardId, line);
  }

  // cardIdを数値として降順ソート（新しいカードが上）
  const sortedLines = Array.from(cardMap.entries())
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([id, line]) => line);

  // ファイルに書き込み
  const output = [header, ...sortedLines].join('\n');
  fs.writeFileSync(tsvPath, output, 'utf8');

  console.log(`${messagePrefix}${cards.length} 件のカード情報を処理しました（合計: ${cardMap.size} 件、重複排除・ソート済み）`);
}

/**
 * 新規カードのQA情報をTSVにマージ（重複排除・ID順ソート）
 */
function mergeToTsv(newQaInfos: CardDetail[], tsvPath: string): void {
  updateTsv(newQaInfos, tsvPath);
}

/**
 * 特定カードを既存TSVで更新（重複排除・ID順ソート）
 */
function updateTsvWithCards(cards: CardDetail[], tsvPath: string): void {
  updateTsv(cards, tsvPath, '✓ ');
}

// ============================================================================
// メイン処理
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const mode = parseScrapingMode(args);

  const scriptsDir = __dirname;
  const dataDir = path.join(scriptsDir, '../..', 'output', 'data');
  const cardsPath = path.join(dataDir, 'cards-all.tsv');
  const tsvPath = path.join(dataDir, 'detail-all.tsv');

  // 出力ディレクトリ作成
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // セッション確立
  const cookieJar = await establishSession();
  if (!cookieJar) {
    console.error('✗ セッションの確立に失敗しました');
    process.exit(1);
  }

  if (mode.type === 'ids') {
    // 特定IDを取得するモード
    console.log(`=== カード指定ID取得 (${mode.ids.length}件) ===\n`);
    const cards = await fetchSpecificCardIds(mode.ids, cookieJar);
    updateTsvWithCards(cards, tsvPath);
  } else if (mode.type === 'top') {
    // 新しい方から件数指定取得モード
    console.log(`=== カード詳細 新しい方から${mode.count}件取得 ===\n`);
    const cards = await fetchTopN(mode.count, cardsPath, cookieJar);
    mergeToTsv(cards, tsvPath);
  } else if (mode.type === 'range') {
    // 範囲指定取得モード
    console.log(`=== カード詳細 範囲指定取得 (${mode.start}番目から${mode.length}件) ===\n`);
    const cards = await fetchRange(mode.start, mode.length, cardsPath, cookieJar);
    mergeToTsv(cards, tsvPath);
  } else {
    // 増分取得モード
    console.log('=== cards-detail増分取得 ===\n');

    // 全カードIDを読み込み
    console.log('cards-all.tsvを読み込み中...');
    const allCardIds = loadAllCardIds(cardsPath);
    if (allCardIds.length === 0) {
      console.error('カードIDが見つかりません。');
      process.exit(1);
    }
    console.log(`✓ ${allCardIds.length} 件のカードIDを読み込みました\n`);

    // 既存cardIdを読み込み
    const existingCardIds = loadExistingCardIds(tsvPath);

    // 新規カードIDを抽出
    const newCardIds = allCardIds.filter(id => !existingCardIds.has(id));
    console.log(`新規カード数: ${newCardIds.length}\n`);

    if (newCardIds.length === 0) {
      console.log('新規カードはありません。');
      console.log('\n=== 完了 ===');
      return;
    }

    console.log('=== QA情報取得開始 ===\n');

    const newQaInfos: CardDetail[] = [];
    let errorCount = 0;
    let supplementCount = 0;
    let pendulumSupplementCount = 0;

    for (let i = 0; i < newCardIds.length; i++) {
      const cardId = newCardIds[i];
      const progress = `[${i + 1}/${newCardIds.length}]`;

      process.stdout.write(`\r${progress} 取得中: ${cardId}...`);

      const qaData = await fetchCardDetail(cardId, cookieJar);

      if (qaData) {
        newQaInfos.push(qaData);
        if (qaData.supplementInfo) supplementCount++;
        if (qaData.pendulumSupplementInfo) pendulumSupplementCount++;
      } else {
        errorCount++;
      }

      // サーバー負荷軽減
      if (i < newCardIds.length - 1) {
        await randomDelay();
      }
    }

    console.log('\n\n=== 取得結果 ===');
    console.log(`取得成功: ${newQaInfos.length}`);
    console.log(`エラー: ${errorCount}`);
    console.log(`補足情報あり: ${supplementCount}`);
    console.log(`P補足情報あり: ${pendulumSupplementCount}`);

    // マージ
    if (newQaInfos.length > 0) {
      console.log('\n=== TSVにマージ中 ===');
      mergeToTsv(newQaInfos, tsvPath);
    }
  }

  console.log('\n=== 完了 ===');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

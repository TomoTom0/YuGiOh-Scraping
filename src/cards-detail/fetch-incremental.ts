import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { establishSession } from '../utils/session.js';
import { fetchCardDetail, type CardDetail } from '../utils/fetchers.js';
import { escapeForTsv } from '../utils/formatters.js';
import { sleep } from '../utils/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// 設定
// ============================================================================

const CONFIG = {
  DELAY_MS: 1000,
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

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
      await sleep(CONFIG.DELAY_MS);
    }
  }

  console.log(`\n\n取得完了: 成功=${successCount}, エラー=${errorCount}`);
  console.log(`補足情報あり: ${supplementCount}`);
  console.log(`P補足情報あり: ${pendulumSupplementCount}`);

  return cards;
}

/**
 * 新規カードのQA情報をTSVにマージ
 */
function mergeToTsv(newQaInfos: CardDetail[], tsvPath: string): void {
  if (newQaInfos.length === 0) {
    console.log('マージするQA情報がありません。');
    return;
  }

  // 新規QA情報をTSV行に変換
  const newLines = newQaInfos.map(qa => [
    qa.cardId,
    escapeForTsv(qa.cardName),
    escapeForTsv(qa.supplementInfo),
    escapeForTsv(qa.supplementDate),
    escapeForTsv(qa.pendulumSupplementInfo),
    escapeForTsv(qa.pendulumSupplementDate)
  ].join('\t'));

  if (!fs.existsSync(tsvPath)) {
    // TSVファイルが存在しない場合は新規作成
    const header = [
      'cardId', 'cardName', 'supplementInfo', 'supplementDate',
      'pendulumSupplementInfo', 'pendulumSupplementDate'
    ].join('\t');
    fs.writeFileSync(tsvPath, header + '\n' + newLines.join('\n'), 'utf8');
    console.log(`新規TSVファイルを作成しました: ${tsvPath}`);
  } else {
    // 既存TSVの先頭（ヘッダーの後）に新規データを追加
    const existingContent = fs.readFileSync(tsvPath, 'utf8');
    const lines = existingContent.split('\n');
    const header = lines[0];
    const existingData = lines.slice(1).filter(line => line.trim());

    const mergedLines = [header, ...newLines, ...existingData];
    fs.writeFileSync(tsvPath, mergedLines.join('\n'), 'utf8');

    console.log(`${newQaInfos.length} 件の新規QA情報をTSVに追加しました`);
  }
}

/**
 * 特定カードを既存TSVで更新
 */
function updateTsvWithCards(cards: CardDetail[], tsvPath: string): void {
  if (cards.length === 0) {
    console.log('更新するカードがありません。');
    return;
  }

  // バックアップ作成
  const backupPath = tsvPath + '.backup';
  if (fs.existsSync(tsvPath)) {
    fs.copyFileSync(tsvPath, backupPath);
    console.log(`\nバックアップ作成: ${backupPath}`);
  }

  // 既存TSVを読み込み
  const content = fs.readFileSync(tsvPath, 'utf8');
  const lines = content.split('\n');
  const header = lines[0];

  // cardIdでマップを作成
  const cardMap = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cardId = line.split('\t')[0];
    if (cardId) {
      cardMap.set(cardId, line);
    }
  }

  // 取得したカードで更新
  for (const card of cards) {
    const newLine = [
      card.cardId,
      escapeForTsv(card.cardName),
      escapeForTsv(card.supplementInfo),
      escapeForTsv(card.supplementDate),
      escapeForTsv(card.pendulumSupplementInfo),
      escapeForTsv(card.pendulumSupplementDate)
    ].join('\t');

    cardMap.set(card.cardId, newLine);
  }

  // TSVを再構築
  const newLines = [header];
  for (const [cardId, line] of cardMap.entries()) {
    newLines.push(line);
  }

  // 更新
  fs.writeFileSync(tsvPath, newLines.join('\n'), 'utf8');

  console.log(`✓ ${cards.length} 件のカードを更新しました`);
}

// ============================================================================
// メイン処理
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // オプション解析
  let idsToFetch: string[] = [];
  let idsFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ids' && i + 1 < args.length) {
      idsToFetch = args[i + 1].split(',').map(id => id.trim()).filter(id => id);
      i++;
    } else if (args[i] === '--ids-file' && i + 1 < args.length) {
      idsFile = args[i + 1];
      i++;
    }
  }

  // ファイルからIDを読み込み
  if (idsFile) {
    if (!fs.existsSync(idsFile)) {
      console.error(`ファイルが見つかりません: ${idsFile}`);
      process.exit(1);
    }
    const fileIds = fs.readFileSync(idsFile, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);
    idsToFetch.push(...fileIds);
  }

  const scriptsDir = __dirname;
  const dataDir = path.join(scriptsDir, '../..', 'output', 'data');
  const cardsPath = path.join(dataDir, 'cards-all.tsv');
  const tsvPath = path.join(dataDir, 'details-all.tsv');

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

  if (idsToFetch.length > 0) {
    // 特定IDを取得するモード
    console.log(`=== カード指定ID取得 (${idsToFetch.length}件) ===\n`);
    const cards = await fetchSpecificCardIds(idsToFetch, cookieJar);
    updateTsvWithCards(cards, tsvPath);
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
        await sleep(CONFIG.DELAY_MS);
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

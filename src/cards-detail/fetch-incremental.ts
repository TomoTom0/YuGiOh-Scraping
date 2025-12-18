import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * セッションを確立する（FAQ検索ページにアクセス）
 */
function establishSession(): Promise<string> {
  const url = 'https://www.db.yugioh-card.com/yugiohdb/faq_search.action?ope=1&request_locale=ja';

  console.log('セッションを確立中...');

  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }, (res) => {
      let html = '';
      res.on('data', (chunk) => { html += chunk; });
      res.on('end', () => {
        // Set-Cookieヘッダーからセッションを取得
        const cookies: string[] = [];
        const setCookieHeaders = res.headers['set-cookie'];
        if (setCookieHeaders) {
          setCookieHeaders.forEach(cookie => {
            const match = cookie.match(/^([^=]+=[^;]+)/);
            if (match) {
              cookies.push(match[1]);
            }
          });
        }
        const cookieJar = cookies.join('; ');
        console.log(`✓ セッション確立完了 (${cookies.length} cookies)\n`);
        resolve(cookieJar);
      });
    }).on('error', (error) => {
      console.error('セッション確立エラー:', error);
      resolve('');
    });
  });
}

// ============================================================================
// 設定
// ============================================================================

const CONFIG = {
  BASE_URL: 'https://www.db.yugioh-card.com/yugiohdb/faq_search.action',
  LOCALE: 'ja',
  DELAY_MS: 1000,
};

// ============================================================================
// 型定義
// ============================================================================

interface QaInfo {
  cardId: string;
  cardName: string;
  supplementInfo?: string;
  supplementDate?: string;
  pendulumSupplementInfo?: string;
  pendulumSupplementDate?: string;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * TSV用にエスケープ
 */
function escapeForTsv(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
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
 * QAページから補足情報を取得
 */
function fetchQAPage(cardId: string, cookieJar: string): Promise<QaInfo | null> {
  const url = `${CONFIG.BASE_URL}?ope=4&cid=${cardId}&request_locale=${CONFIG.LOCALE}`;

  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookieJar
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        try {
          const dom = new JSDOM(html, { url });
          const doc = dom.window.document as unknown as Document;

          // タイトルからカード名を抽出
          const titleElem = doc.querySelector('title');
          const title = titleElem?.textContent || '';
          const cardName = title.split('|')[0]?.trim() || '';

          // 補足情報を取得
          let supplementInfo: string | undefined = undefined;
          let supplementDate: string | undefined = undefined;
          let pendulumSupplementInfo: string | undefined = undefined;
          let pendulumSupplementDate: string | undefined = undefined;

          const supplementElems = doc.querySelectorAll('.supplement');

          supplementElems.forEach(supplementElem => {
            const textElem = supplementElem.querySelector('.text');
            if (!textElem) return;

            const textId = textElem.id;

            // 日付を取得
            const dateElem = supplementElem.querySelector('.title .update');
            const date = dateElem?.textContent?.trim() || undefined;

            // テキストを取得
            const cloned = textElem.cloneNode(true) as HTMLElement;
            cloned.querySelectorAll('br').forEach(br => {
              br.replaceWith('\n');
            });

            // カードリンクを{{カード名|cid}}形式に変換
            cloned.querySelectorAll('a[href*="cid="]').forEach(link => {
              const href = link.getAttribute('href') || '';
              const match = href.match(/[?&]cid=(\d+)/);
              if (match && match[1]) {
                const linkCardId = match[1];
                const cardLinkName = link.textContent?.trim() || '';
                link.replaceWith(`{{${cardLinkName}|${linkCardId}}}`);
              }
            });

            const text = cloned.textContent?.trim() || undefined;

            // IDで判別
            if (textId === 'pen_supplement') {
              pendulumSupplementInfo = text;
              pendulumSupplementDate = date;
            } else if (textId === 'supplement') {
              supplementInfo = text;
              supplementDate = date;
            }
          });

          resolve({
            cardId,
            cardName,
            supplementInfo,
            supplementDate,
            pendulumSupplementInfo,
            pendulumSupplementDate
          });
        } catch (error) {
          console.error(`  パースエラー (card ${cardId}):`, error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error(`  リクエストエラー (card ${cardId}):`, error);
      resolve(null);
    });
  });
}

/**
 * 新規カードのQA情報をTSVにマージ
 */
function mergeToTsv(newQaInfos: QaInfo[], tsvPath: string): void {
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

// ============================================================================
// メイン処理
// ============================================================================

async function main() {
  console.log('=== cards-detail増分取得 ===\n');

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

  const newQaInfos: QaInfo[] = [];
  let errorCount = 0;
  let supplementCount = 0;
  let pendulumSupplementCount = 0;

  for (let i = 0; i < newCardIds.length; i++) {
    const cardId = newCardIds[i];
    const progress = `[${i + 1}/${newCardIds.length}]`;

    process.stdout.write(`\r${progress} 取得中: ${cardId}...`);

    const qaData = await fetchQAPage(cardId, cookieJar);

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

  console.log('\n=== 完了 ===');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

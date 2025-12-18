import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { establishSession } from '../utils/session.js';
import { fetchFaqDetail, type FaqDetail } from '../utils/fetchers.js';
import { escapeForTsv } from '../utils/formatters.js';
import { sleep, parseScrapingMode } from '../utils/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// 設定
// ============================================================================

const CONFIG = {
  BASE_URL: 'https://www.db.yugioh-card.com/yugiohdb/faq_search.action',
  RESULTS_PER_PAGE: 100,
  SORT_UPDATED: 2, // 更新日時順（新しい順）
  LOCALE: 'ja',
  DELAY_MS: 1000,
};

// ============================================================================
// 型定義
// ============================================================================

interface FaqInfo {
  faqId: string;
  question: string;
  answer: string;
  updatedAt?: string;
}

interface FetchResult {
  newFaqs: FaqInfo[];
  stoppedAt: string | null;
  totalFetched: number;
  pagesProcessed: number;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 既存TSVからfaqIdと更新日時をMapで読み込む
 */
function loadExistingFaqsWithDate(tsvPath: string): Map<string, string> {
  const faqMap = new Map<string, string>();

  if (!fs.existsSync(tsvPath)) {
    console.log(`既存TSVファイルが見つかりません: ${tsvPath}`);
    return faqMap;
  }

  const content = fs.readFileSync(tsvPath, 'utf8');
  const lines = content.split('\n');

  // ヘッダーをスキップ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = line.split('\t');
    const faqId = fields[0];
    const updatedAt = fields[3] || '';
    if (faqId) {
      faqMap.set(faqId, updatedAt);
    }
  }

  console.log(`既存TSVから ${faqMap.size} 件のfaqIdを読み込みました`);
  return faqMap;
}

/**
 * 新しい方から指定件数を取得
 */
async function fetchTopN(n: number, cookieJar: string): Promise<FaqInfo[]> {
  const faqs: FaqInfo[] = [];
  let totalFetched = 0;
  let page = 1;

  console.log(`新しい方から ${n} 件取得\n`);

  while (faqs.length < n) {
    console.log(`ページ ${page} を処理中...`);

    try {
      const faqIds = await fetchFaqListPage(page, cookieJar);

      if (faqIds.length === 0) {
        console.log('  FAQが見つかりませんでした。終了します。');
        break;
      }

      console.log(`  ${faqIds.length} 件のFAQ IDを取得`);
      totalFetched += faqIds.length;

      // 必要な件数まで取得
      const remaining = n - faqs.length;
      const toFetch = faqIds.slice(0, remaining);

      for (let i = 0; i < toFetch.length; i++) {
        const faqId = toFetch[i];
        const detail = await fetchFaqDetail(faqId, cookieJar);
        
        if (detail) {
          faqs.push(detail);
        }

        if (i < toFetch.length - 1 || faqs.length < n) {
          await sleep(CONFIG.DELAY_MS);
        }
      }

      console.log(`  取得: ${toFetch.length} 件 (合計: ${faqs.length}/${n})`);

      if (faqs.length >= n) {
        break;
      }

      // 次のページがあるかチェック
      if (faqIds.length < CONFIG.RESULTS_PER_PAGE) {
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

  return faqs;
}

/**
 * 指定範囲を取得 (start位置からlength件)
 */
async function fetchRange(start: number, length: number, cookieJar: string): Promise<FaqInfo[]> {
  const faqs: FaqInfo[] = [];
  let currentIndex = 0;
  let page = 1;

  console.log(`範囲取得: ${start}番目から${length}件 (${start} ~ ${start + length - 1})\n`);

  while (faqs.length < length) {
    console.log(`ページ ${page} を処理中...`);

    try {
      const faqIds = await fetchFaqListPage(page, cookieJar);

      if (faqIds.length === 0) {
        console.log('  FAQが見つかりませんでした。終了します。');
        break;
      }

      console.log(`  ${faqIds.length} 件のFAQ IDを取得`);

      // 各FAQ IDをチェック
      for (const faqId of faqIds) {
        // start位置より前はスキップ
        if (currentIndex < start) {
          currentIndex++;
          continue;
        }

        // 必要な件数に達したら終了
        if (faqs.length >= length) {
          break;
        }

        // 詳細を取得
        const detail = await fetchFaqDetail(faqId, cookieJar);
        if (detail) {
          faqs.push(detail);
        }

        currentIndex++;
        await sleep(CONFIG.DELAY_MS);
      }

      console.log(`  取得: (合計: ${faqs.length}/${length})`);

      if (faqs.length >= length) {
        break;
      }

      // 次のページがあるかチェック
      if (faqIds.length < CONFIG.RESULTS_PER_PAGE) {
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

  return faqs;
}

/**
 * FAQリストページからFAQ IDを取得
 */
async function fetchFaqListPage(page: number, cookieJar: string): Promise<string[]> {
  const url = `https://www.db.yugioh-card.com/yugiohdb/faq_search.action?ope=2&stype=2&keyword=&tag=-1&sort=2&rp=${CONFIG.RESULTS_PER_PAGE}&page=${page}`;

  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Cookie': cookieJar,
        'User-Agent': 'Mozilla/5.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const dom = new JSDOM(data);
          const doc = dom.window.document;
          const rows = doc.querySelectorAll('.t_row');
          const faqIds: string[] = [];

          rows.forEach((row) => {
            const linkValueInput = row.querySelector('input.link_value') as any;
            if (!linkValueInput?.value) {
              return;
            }

            // "/yugiohdb/faq_search.action?ope=5&fid=115&keyword=&tag=-1" から fid を抽出
            const match = linkValueInput.value.match(/[?&]fid=(\d+)/);
            if (match && match[1]) {
              faqIds.push(match[1]);
            }
          });

          resolve(faqIds);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * 増分取得を実行
 */
async function fetchIncremental(existingFaqs: Map<string, string>, cookieJar: string): Promise<FetchResult> {
  const newFaqs: FaqInfo[] = [];
  let stoppedAt: string | null = null;
  let totalFetched = 0;
  let page = 1;
  let shouldStop = false;

  console.log('既存FAQ数:', existingFaqs.size);
  console.log('\n増分取得を開始します...\n');

  while (!shouldStop) {
    console.log(`ページ ${page} を処理中...`);

    try {
      const faqIds = await fetchFaqListPage(page, cookieJar);

      if (faqIds.length === 0) {
        console.log('  FAQが見つかりませんでした。終了します。');
        break;
      }

      console.log(`  ${faqIds.length} 件のFAQ IDを取得`);
      totalFetched += faqIds.length;

      // 各FAQ IDをチェック
      let newInPage = 0;
      for (const faqId of faqIds) {
        if (existingFaqs.has(faqId)) {
          console.log(`  既存FAQ検出: ${faqId}`);
          stoppedAt = faqId;
          shouldStop = true;
          break;
        } else {
          // 詳細を取得
          const detail = await fetchFaqDetail(faqId, cookieJar);
          if (detail) {
            newFaqs.push(detail);
            newInPage++;
          }
          await sleep(CONFIG.DELAY_MS);
        }
      }

      console.log(`  新規FAQ: ${newInPage} 件`);

      if (!shouldStop) {
        if (faqIds.length < CONFIG.RESULTS_PER_PAGE) {
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
    newFaqs,
    stoppedAt,
    totalFetched,
    pagesProcessed: page
  };
}

/**
 * 既存TSVからfaqIdセットを読み込む
 */
function loadExistingFaqIds(tsvPath: string): Set<string> {
  const faqIds = new Set<string>();

  if (!fs.existsSync(tsvPath)) {
    console.log(`既存TSVファイルが見つかりません: ${tsvPath}`);
    return faqIds;
  }

  const content = fs.readFileSync(tsvPath, 'utf8');
  const lines = content.split('\n');

  // ヘッダーをスキップ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = line.split('\t');
    const faqId = fields[0];
    if (faqId) {
      faqIds.add(faqId);
    }
  }

  console.log(`既存TSVから ${faqIds.size} 件のfaqIdを読み込みました`);
  return faqIds;
}

/**
 * faqid-all.tsvから全faqIdを読み込む
 */
function loadAllFaqIds(faqIdListPath: string): string[] {
  if (!fs.existsSync(faqIdListPath)) {
    console.error(`faqid-all.tsvが見つかりません: ${faqIdListPath}`);
    return [];
  }

  const content = fs.readFileSync(faqIdListPath, 'utf8');
  const lines = content.split('\n');
  const faqIds: string[] = [];

  // ヘッダーをスキップ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      faqIds.push(line);
    }
  }

  return faqIds;
}

/**
 * 指定されたfaqIdリストを取得
 */
async function fetchSpecificFaqIds(faqIds: string[], cookieJar: string): Promise<FaqInfo[]> {
  const faqs: FaqInfo[] = [];
  let successCount = 0;
  let errorCount = 0;

  console.log(`\n=== 指定FAQの取得 (${faqIds.length}件) ===\n`);

  for (let i = 0; i < faqIds.length; i++) {
    const faqId = faqIds[i];
    const progress = `[${i + 1}/${faqIds.length}]`;

    process.stdout.write(`\r${progress} 取得中: FAQ ${faqId}...`);

    const detail = await fetchFaqDetail(faqId, cookieJar);

    if (detail) {
      faqs.push(detail);
      successCount++;
    } else {
      errorCount++;
    }

    if (i < faqIds.length - 1) {
      await sleep(CONFIG.DELAY_MS);
    }
  }

  console.log(`\n\n取得完了: 成功=${successCount}, エラー=${errorCount}`);

  return faqs;
}

/**
 * FAQ情報をTSVに書き込み（重複排除・ID順ソート）
 */
function updateFaqTsv(faqs: FaqInfo[], tsvPath: string, existingFaqs?: Map<string, string>): void {
  if (faqs.length === 0) {
    console.log('更新またはマージするFAQがありません。');
    return;
  }

  const header = ['faqId', 'question', 'answer', 'updatedAt'].join('\t');
  const faqMap = new Map<string, string>();

  // 既存データを読み込み
  if (fs.existsSync(tsvPath)) {
    const existingContent = fs.readFileSync(tsvPath, 'utf8');
    const lines = existingContent.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const fields = line.split('\t');
      const faqId = fields[0];
      if (faqId) {
        faqMap.set(faqId, line);
      }
    }
  }

  // 新規・更新FAQで上書き（新しいデータが優先）
  let newCount = 0;
  let updatedCount = 0;
  
  for (const faq of faqs) {
    const line = [
      faq.faqId,
      escapeForTsv(faq.question),
      escapeForTsv(faq.answer),
      escapeForTsv(faq.updatedAt)
    ].join('\t');
    
    if (existingFaqs && existingFaqs.has(faq.faqId)) {
      updatedCount++;
    } else {
      newCount++;
    }
    
    faqMap.set(faq.faqId, line);
  }

  // faqIdを数値として降順ソート（新しいFAQが上）
  const sortedLines = Array.from(faqMap.entries())
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([id, line]) => line);

  // ファイルに書き込み
  const output = [header, ...sortedLines].join('\n');
  fs.writeFileSync(tsvPath, output, 'utf8');

  if (existingFaqs) {
    console.log(`${faqs.length} 件をマージしました (新規: ${newCount}, 更新: ${updatedCount}, 合計: ${faqMap.size} 件、重複排除・ソート済み)`);
  } else {
    console.log(`✓ ${faqs.length} 件のFAQ情報を処理しました（合計: ${faqMap.size} 件、重複排除・ソート済み）`);
  }
}

/**
 * 新規・更新FAQを既存TSVにマージ（重複排除・ID順ソート）
 */
function mergeToTsv(newFaqs: FaqInfo[], tsvPath: string, existingFaqs: Map<string, string>): void {
  updateFaqTsv(newFaqs, tsvPath, existingFaqs);
}

/**
 * 特定FAQを既存TSVで更新（重複排除・ID順ソート）
 */
function updateTsvWithFaqs(faqs: FaqInfo[], tsvPath: string): void {
  updateFaqTsv(faqs, tsvPath);
}

// ============================================================================
// メイン処理
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const mode = parseScrapingMode(args);

  const scriptsDir = __dirname;
  const dataDir = path.join(scriptsDir, '../..', 'output', 'data');
  const tsvPath = path.join(dataDir, 'faq-all.tsv');

  // 出力ディレクトリ作成
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // セッションを確立
  const cookieJar = await establishSession();
  if (!cookieJar) {
    console.error('セッションの確立に失敗しました。');
    process.exit(1);
  }

  if (mode.type === 'ids') {
    // 特定IDを取得するモード
    console.log(`=== FAQ指定ID取得 (${mode.ids.length}件) ===\n`);
    const faqs = await fetchSpecificFaqIds(mode.ids, cookieJar);
    updateTsvWithFaqs(faqs, tsvPath);
  } else if (mode.type === 'top') {
    // 新しい方から件数指定取得モード
    console.log(`=== FAQ 新しい方から${mode.count}件取得 ===\n`);
    const faqs = await fetchTopN(mode.count, cookieJar);
    
    // 既存データを読み込んでマージ
    const existingFaqs = loadExistingFaqsWithDate(tsvPath);
    
    console.log('\n=== 取得結果 ===');
    console.log(`取得成功: ${faqs.length}`);
    
    if (faqs.length > 0) {
      console.log('\n=== TSVにマージ中 ===');
      mergeToTsv(faqs, tsvPath, existingFaqs);
    }
  } else if (mode.type === 'range') {
    // 範囲指定取得モード
    console.log(`=== FAQ 範囲指定取得 (${mode.start}番目から${mode.length}件) ===\n`);
    const faqs = await fetchRange(mode.start, mode.length, cookieJar);
    
    // 既存データを読み込んでマージ
    const existingFaqs = loadExistingFaqsWithDate(tsvPath);
    
    console.log('\n=== 取得結果 ===');
    console.log(`取得成功: ${faqs.length}`);
    
    if (faqs.length > 0) {
      console.log('\n=== TSVにマージ中 ===');
      mergeToTsv(faqs, tsvPath, existingFaqs);
    }
  } else {
    // 増分取得モード
    console.log('=== FAQ増分取得 ===\n');

    // 既存faqIdと更新日時を読み込み
    const existingFaqs = loadExistingFaqsWithDate(tsvPath);

    // 増分取得実行
    const result = await fetchIncremental(existingFaqs, cookieJar);

    console.log('\n=== 取得結果 ===');
    console.log(`処理ページ数: ${result.pagesProcessed}`);
    console.log(`取得FAQ ID総数: ${result.totalFetched}`);
    console.log(`新規+更新FAQ数: ${result.newFaqs.length}`);
    if (result.stoppedAt) {
      console.log(`停止位置 (既存faqId): ${result.stoppedAt}`);
    }

    // マージ
    if (result.newFaqs.length > 0) {
      console.log('\n=== TSVにマージ中 ===');
      mergeToTsv(result.newFaqs, tsvPath, existingFaqs);
    }
  }

  console.log('\n=== 完了 ===');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

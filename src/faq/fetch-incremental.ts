import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { establishSession } from '../utils/session.js';
import { fetchFaqDetail, type FaqDetail } from '../utils/fetchers.js';
import { escapeForTsv } from '../utils/formatters.js';
import { sleep } from '../utils/helpers.js';

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
    const faqId = fields[0]; // faqIdは1番目のフィールド
    if (faqId) {
      faqIds.add(faqId);
    }
  }

  console.log(`既存TSVから ${faqIds.size} 件のfaqIdを読み込みました`);
  return faqIds;
}

/**
 * FAQ一覧ページからfaqIdリストを取得
 */
function fetchFaqIdListFromPage(page: number, cookieJar: string): Promise<string[]> {
  const url = `${CONFIG.BASE_URL}?ope=2&stype=2&keyword=&tag=-1&sort=${CONFIG.SORT_UPDATED}&rp=${CONFIG.RESULTS_PER_PAGE}&page=${page}`;

  console.log(`  フェッチ中: ${url}`);

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

          const faqIds: string[] = [];
          const rows = doc.querySelectorAll('.t_row');

          rows.forEach(row => {
            const rowElement = row as HTMLElement;
            const linkValueInput = rowElement.querySelector('input.link_value') as HTMLInputElement;
            if (!linkValueInput?.value) return;

            const match = linkValueInput.value.match(/[?&]fid=(\d+)/);
            if (match && match[1]) {
              faqIds.push(match[1]);
            }
          });

          resolve(faqIds);
        } catch (error) {
          console.error(`  パースエラー (ページ ${page}):`, error);
          resolve([]);
        }
      });
    }).on('error', (error) => {
      console.error(`  リクエストエラー (ページ ${page}):`, error);
      resolve([]);
    });
  });
}

/**
 * 増分取得を実行
 */
async function fetchIncremental(existingFaqIds: Set<string>, cookieJar: string): Promise<FetchResult> {
  const newFaqs: FaqInfo[] = [];
  let stoppedAt: string | null = null;
  let totalFetched = 0;
  let page = 1;
  let shouldStop = false;

  console.log('\n=== FAQ増分取得開始 ===\n');

  while (!shouldStop) {
    console.log(`ページ ${page} を処理中...`);

    const faqIds = await fetchFaqIdListFromPage(page, cookieJar);

    if (faqIds.length === 0) {
      console.log('  FAQが見つかりませんでした。終了します。');
      break;
    }

    console.log(`  ${faqIds.length} 件のFAQ IDを取得`);
    totalFetched += faqIds.length;

    // 各FAQをチェック
    let newInPage = 0;
    for (const faqId of faqIds) {
      if (existingFaqIds.has(faqId)) {
        console.log(`  既存FAQ検出: faqId=${faqId}`);
        stoppedAt = faqId;
        shouldStop = true;
        break;
      }

      // 詳細を取得
      const detail = await fetchFaqDetail(faqId, cookieJar);
      if (detail) {
        newFaqs.push(detail);
        newInPage++;
        process.stdout.write(`\r  新規FAQ取得中: ${newInPage} 件...`);
      }

      await sleep(CONFIG.DELAY_MS);
    }

    console.log(`\n  新規FAQ: ${newInPage} 件`);

    if (!shouldStop) {
      if (faqIds.length < CONFIG.RESULTS_PER_PAGE) {
        console.log('  最終ページに到達しました。');
        break;
      }

      page++;
      await sleep(CONFIG.DELAY_MS);
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
 * 新規FAQを既存TSVにマージ（先頭に追加）
 */
function mergeToTsv(newFaqs: FaqInfo[], tsvPath: string): void {
  if (newFaqs.length === 0) {
    console.log('マージするFAQがありません。');
    return;
  }

  // 新規FAQをTSV行に変換
  const newLines = newFaqs.map(faq => [
    faq.faqId,
    escapeForTsv(faq.question),
    escapeForTsv(faq.answer),
    escapeForTsv(faq.updatedAt)
  ].join('\t'));

  if (!fs.existsSync(tsvPath)) {
    // TSVファイルが存在しない場合は新規作成
    const header = ['faqId', 'question', 'answer', 'updatedAt'].join('\t');
    fs.writeFileSync(tsvPath, header + '\n' + newLines.join('\n'), 'utf8');
    console.log(`新規TSVファイルを作成しました: ${tsvPath}`);
  } else {
    // 既存TSVの先頭（ヘッダーの後）に新規FAQを追加
    const existingContent = fs.readFileSync(tsvPath, 'utf8');
    const lines = existingContent.split('\n');
    const header = lines[0];
    const existingData = lines.slice(1).filter(line => line.trim());

    const mergedLines = [header, ...newLines, ...existingData];
    fs.writeFileSync(tsvPath, mergedLines.join('\n'), 'utf8');

    console.log(`${newFaqs.length} 件の新規FAQをTSVに追加しました`);
  }
}

/**
 * 特定FAQを既存TSVで更新
 */
function updateTsvWithFaqs(faqs: FaqInfo[], tsvPath: string): void {
  if (faqs.length === 0) {
    console.log('更新するFAQがありません。');
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

  // faqIdでマップを作成
  const faqMap = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const faqId = line.split('\t')[0];
    if (faqId) {
      faqMap.set(faqId, line);
    }
  }

  // 取得したFAQで更新
  for (const faq of faqs) {
    const newLine = [
      faq.faqId,
      escapeForTsv(faq.question),
      escapeForTsv(faq.answer),
      escapeForTsv(faq.updatedAt)
    ].join('\t');

    faqMap.set(faq.faqId, newLine);
  }

  // TSVを再構築
  const newLines = [header];
  for (const [faqId, line] of faqMap.entries()) {
    newLines.push(line);
  }

  // 更新
  fs.writeFileSync(tsvPath, newLines.join('\n'), 'utf8');

  console.log(`✓ ${faqs.length} 件のFAQを更新しました`);
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

  if (idsToFetch.length > 0) {
    // 特定IDを取得するモード
    console.log(`=== FAQ指定ID取得 (${idsToFetch.length}件) ===\n`);
    const faqs = await fetchSpecificFaqIds(idsToFetch, cookieJar);
    updateTsvWithFaqs(faqs, tsvPath);
  } else {
    // 増分取得モード
    console.log('=== FAQ増分取得 ===\n');

    // 既存faqIdを読み込み
    const existingFaqIds = loadExistingFaqIds(tsvPath);

    // 増分取得実行
    const result = await fetchIncremental(existingFaqIds, cookieJar);

    console.log('\n=== 取得結果 ===');
    console.log(`処理ページ数: ${result.pagesProcessed}`);
    console.log(`取得FAQ ID総数: ${result.totalFetched}`);
    console.log(`新規FAQ数: ${result.newFaqs.length}`);
    if (result.stoppedAt) {
      console.log(`停止位置 (既存faqId): ${result.stoppedAt}`);
    }

    // マージ
    if (result.newFaqs.length > 0) {
      console.log('\n=== TSVにマージ中 ===');
      mergeToTsv(result.newFaqs, tsvPath);
    }
  }

  console.log('\n=== 完了 ===');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

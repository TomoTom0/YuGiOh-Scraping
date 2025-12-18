import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

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
 * HTMLElement内のカードリンクを {{カード名|cid}} 形式のテンプレートに変換
 */
function convertCardLinksToTemplate(element: HTMLElement): string {
  const cloned = element.cloneNode(true) as HTMLElement;

  // <br>を改行に変換
  cloned.querySelectorAll('br').forEach(br => {
    br.replaceWith('\n');
  });

  // カードリンク <a href="...?cid=5533">カード名</a> を {{カード名|5533}} に変換
  cloned.querySelectorAll('a[href*="cid="]').forEach(link => {
    const href = link.getAttribute('href') || '';
    const match = href.match(/[?&]cid=(\d+)/);
    if (match && match[1]) {
      const cardId = match[1];
      const cardName = link.textContent?.trim() || '';
      link.replaceWith(`{{${cardName}|${cardId}}}`);
    }
  });

  return cloned.textContent?.trim() || '';
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
    const faqId = fields[0]; // faqIdは1番目のフィールド
    if (faqId) {
      faqIds.add(faqId);
    }
  }

  console.log(`既存TSVから ${faqIds.size} 件のfaqIdを読み込みました`);
  return faqIds;
}

/**
 * Cookieを読み込む
 */
function loadCookies(cookiesPath: string): string {
  if (!fs.existsSync(cookiesPath)) {
    return '';
  }

  const cookieLines = fs.readFileSync(cookiesPath, 'utf8').split('\n');
  const cookies: string[] = [];
  cookieLines.forEach(line => {
    if (line.startsWith('#') || line.trim() === '') return;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      cookies.push(`${parts[5]}=${parts[6]}`);
    }
  });
  return cookies.join('; ');
}

/**
 * セッションを確立する（FAQ検索ページにアクセス）
 */
function establishSession(): Promise<string> {
  const url = `${CONFIG.BASE_URL}?ope=1&request_locale=${CONFIG.LOCALE}`;

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
      let html = '';
      res.on('data', (chunk) => { html += chunk; });
      res.on('end', () => {
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
 * 個別FAQ詳細を取得
 */
function fetchFaqDetail(faqId: string, cookieJar: string): Promise<FaqInfo | null> {
  const url = `${CONFIG.BASE_URL}?ope=5&fid=${faqId}&request_locale=${CONFIG.LOCALE}`;

  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookieJar
      }
    }, (res) => {
      let html = '';
      res.on('data', (chunk) => { html += chunk; });
      res.on('end', () => {
        try {
          const dom = new JSDOM(html, { url });
          const doc = dom.window.document as unknown as Document;

          const questionElem = doc.querySelector('#question_text');
          if (!questionElem) {
            resolve(null);
            return;
          }
          const question = convertCardLinksToTemplate(questionElem as HTMLElement);

          if (!question) {
            resolve(null);
            return;
          }

          const answerElem = doc.querySelector('#answer_text');
          let answer = '';
          if (answerElem) {
            answer = convertCardLinksToTemplate(answerElem as HTMLElement);
          }

          const dateElem = doc.querySelector('#tag_update .date');
          const updatedAt = dateElem?.textContent?.trim() || undefined;

          resolve({
            faqId,
            question,
            answer,
            updatedAt
          });
        } catch (error) {
          console.error(`  パースエラー (FAQ ${faqId}):`, error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error(`  リクエストエラー (FAQ ${faqId}):`, error);
      resolve(null);
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
 * 新規FAQを既存TSVにマージ
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

// ============================================================================
// メイン処理
// ============================================================================

async function main() {
  console.log('=== FAQ増分取得 ===\n');

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

  console.log('\n=== 完了 ===');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

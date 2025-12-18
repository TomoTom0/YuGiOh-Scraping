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

/**
 * 待機
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * QA一覧ページからfaqIdリストを取得
 */
async function fetchFaqIdListFromPage(page: number, rp: number, cookieJar: string): Promise<string[]> {
  const url = `https://www.db.yugioh-card.com/yugiohdb/faq_search.action?ope=2&stype=2&keyword=&tag=-1&sort=2&rp=${rp}&page=${page}`;

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

          // FAQ IDリストを取得
          const faqIds: string[] = [];
          const rows = doc.querySelectorAll('.t_row');

          rows.forEach(row => {
            const rowElement = row as HTMLElement;

            // FAQ IDを取得
            const linkValueInput = rowElement.querySelector('input.link_value') as HTMLInputElement;
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
          console.error(`Parse error for page ${page}:`, error);
          resolve([]);
        }
      });
    }).on('error', (error) => {
      console.error(`Request error for page ${page}:`, error);
      resolve([]);
    });
  });
}

/**
 * メイン処理
 */
async function main() {
  console.log('=== Fetching All FAQ IDs from FAQ List ===\n');

  // セッション確立
  const cookieJar = await establishSession();
  if (!cookieJar) {
    console.error('✗ セッションの確立に失敗しました');
    process.exit(1);
  }

  // 設定
  const totalFaqs = 12600;
  const rp = 100; // 1ページあたりのFAQ数
  const totalPages = Math.ceil(totalFaqs / rp); // 126ページ

  console.log(`Total FAQs: ${totalFaqs}`);
  console.log(`Per page: ${rp}`);
  console.log(`Total pages: ${totalPages}\n`);
  console.log(`⚠ This will take approximately ${Math.round(totalPages / 60)} minutes (1 second per page)\n`);

  // 全ページからfaqIdを取得
  const allFaqIds: string[] = [];
  const startTime = Date.now();

  for (let page = 1; page <= totalPages; page++) {
    const progress = `[${page}/${totalPages}]`;

    // 10ページごとに詳細な進捗を表示
    if (page % 10 === 1 || page === totalPages) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const avgTime = elapsed / page;
      const remaining = Math.round(avgTime * (totalPages - page) / 60);
      console.log(`\n${progress} Progress: ${(page / totalPages * 100).toFixed(1)}%`);
      console.log(`  Elapsed: ${Math.round(elapsed / 60)}min, Remaining: ~${remaining}min`);
      console.log(`  Collected FAQ IDs: ${allFaqIds.length}\n`);
    } else {
      // 簡易進捗
      process.stdout.write(`\r${progress} Fetching page ${page}...`);
    }

    const faqIds = await fetchFaqIdListFromPage(page, rp, cookieJar);

    if (faqIds.length > 0) {
      allFaqIds.push(...faqIds);
      if (page % 10 !== 1 && page !== totalPages) {
        process.stdout.write(` ${faqIds.length} FAQs`);
      }
    } else {
      console.log(`\n  ✗ Failed to fetch page ${page}`);
    }

    // サーバーに負荷をかけないよう待機（1秒）
    if (page < totalPages) {
      await sleep(1000);
    }
  }

  // TSVファイルに書き込み（1列のみ）
  const dataDir = path.join(__dirname, '../..', 'output', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const outputPath = path.join(dataDir, 'faqid-all.tsv');
  console.log(`\n\nWriting FAQ IDs to ${outputPath}...`);

  const tsvLines: string[] = [];
  tsvLines.push('faqId'); // ヘッダー
  allFaqIds.forEach(faqId => {
    tsvLines.push(faqId);
  });

  fs.writeFileSync(outputPath, tsvLines.join('\n'), 'utf8');

  console.log(`✓ TSV file created: ${outputPath}`);
  console.log(`  Total FAQ IDs: ${allFaqIds.length}`);
  console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

  const totalTime = Math.round((Date.now() - startTime) / 1000 / 60);
  console.log(`  Total time: ${totalTime} minutes`);
  console.log('\n✓ Done!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

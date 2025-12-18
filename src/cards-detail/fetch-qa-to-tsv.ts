import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * TSV用にエスケープ
 */
function escapeForTsv(value: string | undefined): string {
  if (!value) return '';
  // タブ、改行、キャリッジリターンを置換
  return value
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * QAページから補足情報を取得
 */
async function fetchQAPage(cardId: string, cookieJar: string): Promise<{
  cardName: string;
  supplementInfo?: string;
  supplementDate?: string;
  pendulumSupplementInfo?: string;
  pendulumSupplementDate?: string;
} | null> {
  const url = `https://www.db.yugioh-card.com/yugiohdb/faq_search.action?ope=4&cid=${cardId}&request_locale=ja`;

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

            // テキストを取得（改行を保持、カードリンクをテンプレート形式に変換）
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
            cardName,
            supplementInfo,
            supplementDate,
            pendulumSupplementInfo,
            pendulumSupplementDate
          });
        } catch (error) {
          console.error('Parse error:', error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error('Request error:', error);
      resolve(null);
    });
  });
}

/**
 * メイン処理
 */
async function main() {
  console.log('=== Fetching QA Page and Generating TSV ===\n');

  // セッション確立用のCookieを取得
  console.log('Establishing session...');
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  let cookieJar = '';

  if (fs.existsSync(cookiesPath)) {
    const cookieLines = fs.readFileSync(cookiesPath, 'utf8').split('\n');
    const cookies: string[] = [];
    cookieLines.forEach(line => {
      if (line.startsWith('#') || line.trim() === '') return;
      const parts = line.split('\t');
      if (parts.length >= 7) {
        cookies.push(`${parts[5]}=${parts[6]}`);
      }
    });
    cookieJar = cookies.join('; ');
  }

  // テストカードID（WAKE CUP！ アル）
  const testCardId = '22132';

  console.log(`Fetching QA page for card ID: ${testCardId}...`);
  const qaData = await fetchQAPage(testCardId, cookieJar);

  if (!qaData) {
    console.error('Failed to fetch QA page');
    process.exit(1);
  }

  console.log(`Card Name: ${qaData.cardName}`);
  console.log(`Supplement Info: ${qaData.supplementInfo ? 'Found' : 'None'}`);
  console.log(`Pendulum Supplement Info: ${qaData.pendulumSupplementInfo ? 'Found' : 'None'}`);
  console.log('');

  // TSVファイルを生成
  const outputPath = path.join(__dirname, 'qa-test.tsv');
  console.log(`Writing TSV to ${outputPath}...`);

  const tsvLines: string[] = [];

  // ヘッダー行
  tsvLines.push([
    'cardId',
    'cardName',
    'supplementInfo',
    'supplementDate',
    'pendulumSupplementInfo',
    'pendulumSupplementDate'
  ].join('\t'));

  // データ行
  tsvLines.push([
    testCardId,
    escapeForTsv(qaData.cardName),
    escapeForTsv(qaData.supplementInfo),
    escapeForTsv(qaData.supplementDate),
    escapeForTsv(qaData.pendulumSupplementInfo),
    escapeForTsv(qaData.pendulumSupplementDate)
  ].join('\t'));

  fs.writeFileSync(outputPath, tsvLines.join('\n'), 'utf8');

  console.log(`✓ TSV file created: ${outputPath}`);
  console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
  console.log('\n✓ Done!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

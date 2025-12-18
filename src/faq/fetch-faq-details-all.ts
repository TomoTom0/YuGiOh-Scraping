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
 * 待機
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      // {{カード名|cid}} 形式に変換
      link.replaceWith(`{{${cardName}|${cardId}}}`);
    }
  });

  return cloned.textContent?.trim() || '';
}

/**
 * カードのQA一覧を取得してfaqIdリストを返す
 */
async function fetchFaqIdList(cardId: string, cookieJar: string): Promise<{
  cardId: string;
  cardName: string;
  faqIds: string[];
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

          resolve({
            cardId,
            cardName,
            faqIds
          });
        } catch (error) {
          console.error(`Parse error for card ${cardId}:`, error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error(`Request error for card ${cardId}:`, error);
      resolve(null);
    });
  });
}

/**
 * 個別FAQ詳細を取得
 */
async function fetchFaqDetail(faqId: string, cookieJar: string): Promise<{
  faqId: string;
  question: string;
  answer: string;
  updatedAt?: string;
} | null> {
  const url = `https://www.db.yugioh-card.com/yugiohdb/faq_search.action?ope=5&fid=${faqId}&request_locale=ja`;

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

          // 質問文を取得（#question_text から）カードリンクをテンプレート形式に変換
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

          // 回答を取得（#answer_text から）カードリンクをテンプレート形式に変換
          const answerElem = doc.querySelector('#answer_text');
          let answer = '';
          if (answerElem) {
            answer = convertCardLinksToTemplate(answerElem as HTMLElement);
          }

          // 更新日を取得（オプション）
          const dateElem = doc.querySelector('#tag_update .date');
          const updatedAt = dateElem?.textContent?.trim() || undefined;

          resolve({
            faqId,
            question,
            answer,
            updatedAt
          });
        } catch (error) {
          console.error(`Parse error for FAQ ${faqId}:`, error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error(`Request error for FAQ ${faqId}:`, error);
      resolve(null);
    });
  });
}

/**
 * メイン処理
 */
async function main() {
  console.log('=== Fetching FAQ Details (All Cards) ===\n');

  // セッション確立用のCookieを取得
  console.log('Loading cookies...');
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
    console.log('✓ Cookies loaded\n');
  } else {
    console.error('✗ cookies.txt not found');
    process.exit(1);
  }

  // cards-all.tsvからcardIdを読み込む
  console.log('Reading cards-all.tsv...');
  const cardsPath = path.join(__dirname, 'cards-all.tsv');
  const cardsContent = fs.readFileSync(cardsPath, 'utf8');
  const lines = cardsContent.split('\n');

  // ヘッダー行をスキップして全件を取得
  const cardIds: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = line.split('\t');
    // cardIdは4列目（インデックス3）
    const cardId = fields[3];
    if (cardId) {
      cardIds.push(cardId);
    }
  }

  console.log(`✓ Found ${cardIds.length} card IDs to process\n`);
  console.log(`⚠ Processing time will depend on the number of FAQs (estimated 30,000+ FAQs)\n`);

  // 出力ファイルのパス
  const outputPath = path.join(__dirname, 'faq-details-all.tsv');
  console.log(`Output file: ${outputPath}\n`);

  // TSVヘッダーを書き込み
  const tsvLines: string[] = [];
  tsvLines.push([
    'cardId',
    'cardName',
    'faqId',
    'question',
    'answer',
    'updatedAt'
  ].join('\t'));

  // 統計情報
  let totalCards = 0;
  let totalFaqs = 0;
  let errorCount = 0;
  let cardsWithFaqs = 0;

  const startTime = Date.now();

  // 各カードのFAQ詳細を取得
  for (let i = 0; i < cardIds.length; i++) {
    const cardId = cardIds[i];
    const progress = `[${i + 1}/${cardIds.length}]`;

    // 100件ごとに詳細な進捗を表示
    if ((i + 1) % 100 === 0 || i === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const avgTimePerCard = elapsed / (i + 1);
      const avgFaqsPerCard = totalCards > 0 ? totalFaqs / totalCards : 0;
      const remainingCards = cardIds.length - i - 1;
      const estimatedRemainingFaqs = Math.round(remainingCards * avgFaqsPerCard);
      const estimatedRemainingTime = Math.round(remainingCards * avgTimePerCard / 60);

      console.log(`\n${progress} Progress: ${((i + 1) / cardIds.length * 100).toFixed(1)}%`);
      console.log(`  Elapsed: ${Math.round(elapsed / 60)}min`);
      console.log(`  Processed: ${totalCards} cards, ${totalFaqs} FAQs (${cardsWithFaqs} cards with FAQs)`);
      console.log(`  Errors: ${errorCount}`);
      console.log(`  Avg: ${avgFaqsPerCard.toFixed(2)} FAQs/card`);
      console.log(`  Estimated remaining: ~${estimatedRemainingFaqs} FAQs, ~${estimatedRemainingTime}min\n`);
    }

    // 1. QA一覧を取得してfaqIdリストを取得
    const faqList = await fetchFaqIdList(cardId, cookieJar);

    if (!faqList) {
      errorCount++;
      await sleep(1000);
      continue;
    }

    if ((i + 1) % 100 !== 0 && i !== 0) {
      // 簡易進捗（100件ごとの詳細表示以外）
      process.stdout.write(`\r${progress} ${faqList.cardName}: ${faqList.faqIds.length} FAQs...`);
    }

    if (faqList.faqIds.length === 0) {
      totalCards++;
      await sleep(1000);
      continue;
    }

    cardsWithFaqs++;

    // 2. 各faqIdについて詳細を取得
    for (let j = 0; j < faqList.faqIds.length; j++) {
      const faqId = faqList.faqIds[j];

      const faqDetail = await fetchFaqDetail(faqId, cookieJar);

      if (faqDetail) {
        tsvLines.push([
          faqList.cardId,
          escapeForTsv(faqList.cardName),
          faqDetail.faqId,
          escapeForTsv(faqDetail.question),
          escapeForTsv(faqDetail.answer),
          escapeForTsv(faqDetail.updatedAt)
        ].join('\t'));

        totalFaqs++;
      } else {
        errorCount++;
      }

      // サーバーに負荷をかけないよう待機（1秒）
      await sleep(1000);
    }

    totalCards++;

    // 1000件ごとに中間ファイルを保存（エラー時の復旧用）
    if (totalFaqs > 0 && totalFaqs % 1000 === 0) {
      const tempPath = path.join(__dirname, `faq-details-all-temp-${totalFaqs}.tsv`);
      fs.writeFileSync(tempPath, tsvLines.join('\n'), 'utf8');
      console.log(`\n  📁 Saved checkpoint: ${tempPath} (${totalFaqs} FAQs)`);
    }
  }

  // TSVファイルに書き込み
  console.log(`\n\nWriting TSV to ${outputPath}...`);
  fs.writeFileSync(outputPath, tsvLines.join('\n'), 'utf8');

  console.log(`✓ TSV file created: ${outputPath}`);
  console.log(`  Total cards: ${totalCards}`);
  console.log(`  Cards with FAQs: ${cardsWithFaqs}`);
  console.log(`  Total FAQs: ${totalFaqs}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);

  const totalTime = Math.round((Date.now() - startTime) / 1000 / 60);
  console.log(`  Total time: ${totalTime} minutes`);
  console.log('\n✓ Done!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

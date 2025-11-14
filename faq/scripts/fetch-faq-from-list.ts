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
  console.log('=== Fetching FAQ Details from FAQ ID List ===\n');

  // コマンドライン引数で開始位置を取得
  let startFrom = 0;
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--start-from=')) {
      startFrom = parseInt(arg.split('=')[1], 10);
      if (isNaN(startFrom) || startFrom < 0) {
        console.error('✗ Invalid --start-from value');
        process.exit(1);
      }
    }
  }

  // セッション確立用のCookieを取得
  console.log('Loading cookies...');
  const cookiesPath = path.join(__dirname, '..', 'config', 'cookies.txt');
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

  // faqIdリストを読み込む
  console.log('Reading faqid-all.tsv...');
  const faqIdListPath = path.join(__dirname, '..', 'output', 'faqid-all.tsv');
  const faqIdContent = fs.readFileSync(faqIdListPath, 'utf8');
  const lines = faqIdContent.split('\n');

  // ヘッダー行をスキップして全件を取得
  const faqIds: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    faqIds.push(line.trim());
  }

  console.log(`✓ Found ${faqIds.length} FAQ IDs to process\n`);

  // 再開モードの場合
  const tsvLines: string[] = [];
  let successCount = 0;
  let errorCount = 0;

  if (startFrom > 0) {
    console.log(`⚠️ Resume mode: Starting from index ${startFrom}\n`);

    // 最新の中間ファイルを検索して読み込む
    const tempDir = path.join(__dirname, '..', 'temp');
    let latestTempFile: string | null = null;
    let maxIndex = 0;

    if (fs.existsSync(tempDir)) {
      const tempFiles = fs.readdirSync(tempDir).filter(f => f.match(/^faq-all-temp-\d+\.tsv$/));
      for (const file of tempFiles) {
        const match = file.match(/faq-all-temp-(\d+)\.tsv/);
        if (match) {
          const index = parseInt(match[1], 10);
          if (index <= startFrom && index > maxIndex) {
            maxIndex = index;
            latestTempFile = path.join(tempDir, file);
          }
        }
      }
    }

    if (latestTempFile && fs.existsSync(latestTempFile)) {
      console.log(`✓ Loading checkpoint: ${path.basename(latestTempFile)}`);
      const tempContent = fs.readFileSync(latestTempFile, 'utf8');
      const tempLines = tempContent.split('\n');

      // 既存データをtsvLinesに追加
      tempLines.forEach(line => tsvLines.push(line));

      // 統計情報を計算
      successCount = tempLines.length - 1; // ヘッダーを除く

      console.log(`✓ Loaded ${successCount} existing records\n`);
    } else {
      // 中間ファイルがない場合はヘッダーを追加
      tsvLines.push([
        'faqId',
        'question',
        'answer',
        'updatedAt'
      ].join('\t'));
    }
  } else {
    // 新規実行の場合
    tsvLines.push([
      'faqId',
      'question',
      'answer',
      'updatedAt'
    ].join('\t'));
    console.log(`⚠ This will take approximately ${Math.round(faqIds.length / 60)} minutes (1 second per FAQ)\n`);
  }

  // 出力ファイルのパス
  const outputPath = path.join(__dirname, '..', 'output', 'faq-all.tsv');
  console.log(`Output file: ${outputPath}\n`);

  const startTime = Date.now();

  // 各FAQの詳細を取得
  for (let i = startFrom; i < faqIds.length; i++) {
    const faqId = faqIds[i];
    const progress = `[${i + 1}/${faqIds.length}]`;

    // 100件ごとに詳細な進捗を表示
    if ((i + 1) % 100 === 0 || i === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const avgTime = elapsed / (i + 1);
      const remaining = Math.round(avgTime * (faqIds.length - i - 1) / 60);

      console.log(`\n${progress} Progress: ${((i + 1) / faqIds.length * 100).toFixed(1)}%`);
      console.log(`  Elapsed: ${Math.round(elapsed / 60)}min, Remaining: ~${remaining}min`);
      console.log(`  Success: ${successCount}, Errors: ${errorCount}\n`);
    } else {
      // 簡易進捗
      process.stdout.write(`\r${progress} Fetching FAQ ${faqId}...`);
    }

    const faqDetail = await fetchFaqDetail(faqId, cookieJar);

    if (faqDetail) {
      tsvLines.push([
        faqDetail.faqId,
        escapeForTsv(faqDetail.question),
        escapeForTsv(faqDetail.answer),
        escapeForTsv(faqDetail.updatedAt)
      ].join('\t'));

      successCount++;
    } else {
      errorCount++;
    }

    // サーバーに負荷をかけないよう待機（1秒）
    if (i < faqIds.length - 1) {
      await sleep(1000);
    }

    // 1000件ごとに中間ファイルを保存（エラー時の復旧用）
    if ((i + 1) % 1000 === 0) {
      const tempPath = path.join(__dirname, '..', 'temp', `faq-all-temp-${i + 1}.tsv`);
      fs.writeFileSync(tempPath, tsvLines.join('\n'), 'utf8');
      console.log(`\n  📁 Saved checkpoint: ${path.basename(tempPath)} (${successCount} FAQs)`);
    }
  }

  // TSVファイルに書き込み
  console.log(`\n\nWriting TSV to ${outputPath}...`);
  fs.writeFileSync(outputPath, tsvLines.join('\n'), 'utf8');

  console.log(`✓ TSV file created: ${outputPath}`);
  console.log(`  Success: ${successCount}`);
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

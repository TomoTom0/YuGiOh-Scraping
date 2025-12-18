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
 * QAページから補足情報を取得
 */
async function fetchQAPage(cardId: string, cookieJar: string): Promise<{
  cardId: string;
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
            cardId,
            cardName,
            supplementInfo,
            supplementDate,
            pendulumSupplementInfo,
            pendulumSupplementDate
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
 * メイン処理
 */
async function main() {
  console.log('=== Fetching QA Pages (All Cards) ===\n');

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

  // セッション確立
  const cookieJar = await establishSession();
  if (!cookieJar) {
    console.error('✗ セッションの確立に失敗しました');
    process.exit(1);
  }

  // cards-all.tsvからcardIdを読み込む
  console.log('Reading cards-all.tsv...');
  const cardsPath = path.join(__dirname, '../..', 'output', 'data', 'cards-all.tsv');
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

  // 再開モードの場合
  const tsvLines: string[] = [];
  let successCount = 0;
  let errorCount = 0;
  let supplementCount = 0;
  let pendulumSupplementCount = 0;

  if (startFrom > 0) {
    console.log(`⚠️ Resume mode: Starting from index ${startFrom}\n`);

    // 最新の中間ファイルを検索して読み込む
    const tempDir = path.join(__dirname, '../..', 'output', '.temp', 'cards-detail');
    let latestTempFile: string | null = null;
    let maxIndex = 0;

    if (fs.existsSync(tempDir)) {
      const tempFiles = fs.readdirSync(tempDir).filter(f => f.match(/^details-all-temp-\d+\.tsv$/));
      for (const file of tempFiles) {
        const match = file.match(/details-all-temp-(\d+)\.tsv/);
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
      tempLines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const fields = line.split('\t');
        if (fields[2]) supplementCount++; // supplementInfo
        if (fields[4]) pendulumSupplementCount++; // pendulumSupplementInfo
      });

      console.log(`✓ Loaded ${successCount} existing records\n`);
    } else {
      // 中間ファイルがない場合はヘッダーを追加
      tsvLines.push([
        'cardId',
        'cardName',
        'supplementInfo',
        'supplementDate',
        'pendulumSupplementInfo',
        'pendulumSupplementDate'
      ].join('\t'));
    }
  } else {
    // 新規実行の場合
    tsvLines.push([
      'cardId',
      'cardName',
      'supplementInfo',
      'supplementDate',
      'pendulumSupplementInfo',
      'pendulumSupplementDate'
    ].join('\t'));
    console.log(`⚠ This will take approximately ${Math.round(cardIds.length / 60)} minutes (1 second per card)\n`);
  }

  // 出力ファイルのパス
  const outputPath = path.join(__dirname, '../..', 'output', 'data', 'details-all.tsv');
  console.log(`Output file: ${outputPath}\n`);

  const startTime = Date.now();

  for (let i = startFrom; i < cardIds.length; i++) {
    const cardId = cardIds[i];
    const progress = `[${i + 1}/${cardIds.length}]`;

    // 100件ごとに詳細な進捗を表示
    if ((i + 1) % 100 === 0 || i === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const avgTime = elapsed / (i + 1);
      const remaining = Math.round(avgTime * (cardIds.length - i - 1) / 60);
      console.log(`\n${progress} Progress: ${((i + 1) / cardIds.length * 100).toFixed(1)}%`);
      console.log(`  Elapsed: ${Math.round(elapsed / 60)}min, Remaining: ~${remaining}min`);
      console.log(`  Success: ${successCount}, Errors: ${errorCount}`);
      console.log(`  Supplements: ${supplementCount} card, ${pendulumSupplementCount} pendulum\n`);
    } else {
      // 簡易進捗（同じ行に上書き）
      process.stdout.write(`\r${progress} Fetching: ${cardId}...`);
    }

    const qaData = await fetchQAPage(cardId, cookieJar);

    if (qaData) {
      tsvLines.push([
        qaData.cardId,
        escapeForTsv(qaData.cardName),
        escapeForTsv(qaData.supplementInfo),
        escapeForTsv(qaData.supplementDate),
        escapeForTsv(qaData.pendulumSupplementInfo),
        escapeForTsv(qaData.pendulumSupplementDate)
      ].join('\t'));

      successCount++;
      if (qaData.supplementInfo) supplementCount++;
      if (qaData.pendulumSupplementInfo) pendulumSupplementCount++;
    } else {
      errorCount++;
    }

    // サーバーに負荷をかけないよう待機（1秒）
    if (i < cardIds.length - 1) {
      await sleep(1000);
    }

    // 1000件ごとに中間ファイルを保存（エラー時の復旧用）
    if ((i + 1) % 1000 === 0) {
      const tempDir = path.join(__dirname, '../..', 'output', '.temp', 'cards-detail');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempPath = path.join(tempDir, `details-all-temp-${i + 1}.tsv`);
      fs.writeFileSync(tempPath, tsvLines.join('\n'), 'utf8');
      console.log(`  📁 Saved checkpoint: ${path.basename(tempPath)}`);
    }
  }

  // TSVファイルに書き込み
  console.log(`\n\nWriting TSV to ${outputPath}...`);
  fs.writeFileSync(outputPath, tsvLines.join('\n'), 'utf8');

  console.log(`✓ TSV file created: ${outputPath}`);
  console.log(`  Total records: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Card supplements: ${supplementCount}`);
  console.log(`  Pendulum supplements: ${pendulumSupplementCount}`);
  console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

  const totalTime = Math.round((Date.now() - startTime) / 1000 / 60);
  console.log(`  Total time: ${totalTime} minutes`);
  console.log('\n✓ Done!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

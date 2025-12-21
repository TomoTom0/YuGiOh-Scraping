import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { establishSession } from '../utils/session.js';
import { fetchFaqDetail } from '../utils/fetchers.js';
import { escapeForTsv } from '../utils/formatters.js';
import { sleep } from '../utils/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ランダム遅延（1000-3000ms）
 */
function randomDelay(): Promise<void> {
  const delay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
  console.log(`  待機: ${delay}ms`);
  return sleep(delay);
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

  // セッション確立
  const cookieJar = await establishSession();
  if (!cookieJar) {
    console.error('✗ セッションの確立に失敗しました');
    process.exit(1);
  }

  // faqIdリストを読み込む
  console.log('Reading faqid-all.tsv...');
  const faqIdListPath = path.join(__dirname, '../..', 'output', 'data', 'faqid-all.tsv');
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
    const tempDir = path.join(__dirname, '../..', 'output', '.temp', 'faq');
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
  const outputPath = path.join(__dirname, '../..', 'output', 'data', 'faq-all.tsv');
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
      await randomDelay();
    }

    // 1000件ごとに中間ファイルを保存（エラー時の復旧用）
    if ((i + 1) % 1000 === 0) {
      const tempDir = path.join(__dirname, '../..', 'output', '.temp', 'faq');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempPath = path.join(tempDir, `faq-all-temp-${i + 1}.tsv`);
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

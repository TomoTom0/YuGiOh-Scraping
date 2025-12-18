#!/usr/bin/env bun

/**
 * 統合アップデートスクリプト
 *
 * 使い方:
 *   bun run update:cards              # カードデータ増分取得
 *   bun run update:detail             # 詳細データ増分取得
 *   bun run update:faq                # FAQデータ増分取得
 *   bun run update:all                # 全て増分取得
 *   bun run update:cards --force-all  # カードデータ全件取得
 *   bun run update:all --force-all    # 全て全件取得
 *   bun run update:cards --top 10     # カードデータ新しい方から10件
 *   bun run update:detail --top 10    # 詳細データ新しい方から10件
 *   bun run update:faq --top 10       # FAQデータ新しい方から10件
 *   bun run update:cards --range 0 10 # カードデータ0番目から10件
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TaskConfig {
  name: string;
  incrementalScript: string;
  fullScript?: string;
  description: string;
}

const TASKS: Record<string, TaskConfig> = {
  cards: {
    name: 'カード基本情報',
    incrementalScript: 'src/cards-data/fetch-incremental.ts',
    description: 'カード基本情報の増分取得'
  },
  detail: {
    name: 'カード詳細情報',
    incrementalScript: 'src/cards-detail/fetch-incremental.ts',
    fullScript: 'src/cards-detail/fetch-qa-all.ts',
    description: 'カード詳細情報の増分取得'
  },
  faq: {
    name: 'FAQ情報',
    incrementalScript: 'src/faq/fetch-incremental.ts',
    fullScript: 'src/faq/fetch-faq-from-list.ts',
    description: 'FAQ情報の増分取得'
  }
};

/**
 * スクリプトを実行
 */
function runScript(scriptPath: string, args: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(__dirname, '..', scriptPath);
    console.log(`\n>>> 実行中: ${scriptPath}`);

    const proc = spawn('bun', ['run', fullPath, ...args], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * タスクを実行
 */
async function runTask(taskKey: string, forceAll: boolean, extraArgs: string[] = []): Promise<void> {
  const task = TASKS[taskKey];
  if (!task) {
    throw new Error(`Unknown task: ${taskKey}`);
  }

  // モード判定
  let mode = '増分取得';
  if (forceAll) {
    mode = '全件取得';
  } else if (extraArgs.some(arg => arg.startsWith('--range'))) {
    const rangeIndex = extraArgs.findIndex(arg => arg === '--range');
    const start = rangeIndex >= 0 && rangeIndex + 1 < extraArgs.length ? extraArgs[rangeIndex + 1] : '?';
    const length = rangeIndex >= 0 && rangeIndex + 2 < extraArgs.length ? extraArgs[rangeIndex + 2] : '?';
    mode = `範囲取得 (${start}番目から${length}件)`;
  } else if (extraArgs.some(arg => arg.startsWith('--top'))) {
    const topIndex = extraArgs.findIndex(arg => arg === '--top');
    const count = topIndex >= 0 && topIndex + 1 < extraArgs.length ? extraArgs[topIndex + 1] : '?';
    mode = `新しい方から${count}件取得`;
  } else if (extraArgs.some(arg => arg.startsWith('--ids'))) {
    mode = '指定ID取得';
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${task.name}`);
  console.log(`  モード: ${mode}`);
  console.log(`${'='.repeat(60)}`);

  if (forceAll && task.fullScript) {
    await runScript(task.fullScript, extraArgs);
  } else {
    if (forceAll && !task.fullScript) {
      console.log(`⚠ ${task.name}には全件取得スクリプトがありません。増分取得を実行します。`);
    }
    await runScript(task.incrementalScript, extraArgs);
  }
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: タスク名を指定してください');
    console.log('\n使用可能なタスク:');
    console.log('  cards  - カード基本情報');
    console.log('  detail - カード詳細情報');
    console.log('  faq    - FAQ情報');
    console.log('  all    - 全てのタスク');
    console.log('\nオプション:');
    console.log('  --force-all           全件取得モード');
    console.log('  --top N               新しい方からN件取得');
    console.log('  --range START LENGTH  指定範囲取得（START番目からLENGTH件）');
    console.log('  --ids ID1,ID2,...     指定IDを取得');
    console.log('  --ids-file PATH       ファイルから指定IDを取得');
    console.log('\n例:');
    console.log('  bun run update:cards');
    console.log('  bun run update:all');
    console.log('  bun run update:cards --force-all');
    console.log('  bun run update:cards --top 10');
    console.log('  bun run update:cards --range 0 10');
    console.log('  bun run update:detail --ids 12345,67890');
    process.exit(1);
  }

  const taskName = args[0];
  const forceAll = args.includes('--force-all');
  const extraArgs = args.slice(1).filter(arg => arg !== '--force-all');

  const startTime = Date.now();

  try {
    if (taskName === 'all') {
      // 全タスクを順次実行
      console.log('\n>>> 全タスクを実行します...\n');
      for (const [key, task] of Object.entries(TASKS)) {
        await runTask(key, forceAll, extraArgs);
      }
    } else if (TASKS[taskName]) {
      // 指定されたタスクを実行
      await runTask(taskName, forceAll, extraArgs);
    } else {
      console.error(`Error: 不明なタスク "${taskName}"`);
      console.log('使用可能なタスク: cards, detail, faq, all');
      process.exit(1);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ✓ 全ての処理が完了しました (${elapsed}秒)`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('\n✗ エラーが発生しました:', error);
    process.exit(1);
  }
}

main();

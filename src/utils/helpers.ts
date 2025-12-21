import * as fs from 'fs';

/**
 * 待機
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ランダム遅延（1000-3000ms）
 * 公式サイトへのAPI通信時に使用
 */
export function randomDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`  待機: ${delay}ms`);
  return sleep(delay);
}

/**
 * スクレイピングモード
 */
export type ScrapingMode = 
  | { type: 'incremental' }  // 増分取得
  | { type: 'top'; count: number }  // 新しい方からN件
  | { type: 'range'; start: number; length: number }  // 指定範囲取得
  | { type: 'ids'; ids: string[] };  // 指定ID取得

/**
 * コマンドライン引数を解析してスクレイピングモードを判定
 */
export function parseScrapingMode(args: string[]): ScrapingMode {
  let topN: number | null = null;
  let rangeStart: number | null = null;
  let rangeLength: number | null = null;
  let idsToFetch: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--top' && i + 1 < args.length) {
      topN = parseInt(args[i + 1], 10);
      if (isNaN(topN) || topN <= 0) {
        throw new Error('--top には正の整数を指定してください');
      }
      i++;
    } else if (args[i] === '--range' && i + 2 < args.length) {
      rangeStart = parseInt(args[i + 1], 10);
      rangeLength = parseInt(args[i + 2], 10);
      if (isNaN(rangeStart) || rangeStart < 0) {
        throw new Error('--range の start には0以上の整数を指定してください');
      }
      if (isNaN(rangeLength) || rangeLength <= 0) {
        throw new Error('--range の length には正の整数を指定してください');
      }
      i += 2;
    } else if (args[i] === '--ids' && i + 1 < args.length) {
      idsToFetch = args[i + 1].split(',').map(id => id.trim()).filter(id => id);
      i++;
    } else if (args[i] === '--ids-file' && i + 1 < args.length) {
      const idsFile = args[i + 1];
      if (!fs.existsSync(idsFile)) {
        throw new Error(`ファイルが見つかりません: ${idsFile}`);
      }
      const fileIds = fs.readFileSync(idsFile, 'utf8')
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line);
      idsToFetch.push(...fileIds);
      i++;
    }
  }

  // 優先順位: --ids > --range > --top > 増分取得
  if (idsToFetch.length > 0) {
    return { type: 'ids', ids: idsToFetch };
  } else if (rangeStart !== null && rangeLength !== null) {
    return { type: 'range', start: rangeStart, length: rangeLength };
  } else if (topN !== null) {
    return { type: 'top', count: topN };
  } else {
    return { type: 'incremental' };
  }
}

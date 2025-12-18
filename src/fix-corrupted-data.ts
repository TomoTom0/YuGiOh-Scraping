#!/usr/bin/env bun

/**
 * 文字化けデータの修正スクリプト
 *
 * 使い方:
 *   bun run src/fix-corrupted-data.ts faq <faqIdリストファイル>
 *   bun run src/fix-corrupted-data.ts details <cardIdリストファイル>
 *
 * 例:
 *   bun run src/fix-corrupted-data.ts faq tmp/corrupted-faqids.txt
 *   bun run src/fix-corrupted-data.ts details tmp/corrupted-cardids.txt
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * セッションを確立
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
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
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
 * FAQ詳細を取得
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
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
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
 * カード詳細を取得
 */
async function fetchCardDetail(cardId: string, cookieJar: string): Promise<{
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

          const titleElem = doc.querySelector('title');
          const title = titleElem?.textContent || '';
          const cardName = title.split('|')[0]?.trim() || '';

          let supplementInfo: string | undefined = undefined;
          let supplementDate: string | undefined = undefined;
          let pendulumSupplementInfo: string | undefined = undefined;
          let pendulumSupplementDate: string | undefined = undefined;

          const supplementElems = doc.querySelectorAll('.supplement');

          supplementElems.forEach(supplementElem => {
            const textElem = supplementElem.querySelector('.text');
            if (!textElem) return;

            const textId = textElem.id;

            const dateElem = supplementElem.querySelector('.title .update');
            const date = dateElem?.textContent?.trim() || undefined;

            const cloned = textElem.cloneNode(true) as HTMLElement;
            cloned.querySelectorAll('br').forEach(br => {
              br.replaceWith('\n');
            });

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
 * FAQ TSVを更新
 */
async function updateFaqTsv(faqIds: string[], cookieJar: string) {
  const tsvPath = path.join(__dirname, '..', 'output', 'data', 'faq-all.tsv');

  console.log(`\n=== FAQ データ修正 (${faqIds.length}件) ===\n`);

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

  let successCount = 0;
  let errorCount = 0;

  // 各FAQを再取得
  for (let i = 0; i < faqIds.length; i++) {
    const faqId = faqIds[i];
    const progress = `[${i + 1}/${faqIds.length}]`;

    process.stdout.write(`\r${progress} Fetching FAQ ${faqId}...`);

    const faqDetail = await fetchFaqDetail(faqId, cookieJar);

    if (faqDetail) {
      const newLine = [
        faqDetail.faqId,
        escapeForTsv(faqDetail.question),
        escapeForTsv(faqDetail.answer),
        escapeForTsv(faqDetail.updatedAt)
      ].join('\t');

      faqMap.set(faqId, newLine);
      successCount++;
    } else {
      errorCount++;
    }

    if (i < faqIds.length - 1) {
      await sleep(1000);
    }
  }

  // TSVを再構築
  const newLines = [header];
  for (const [faqId, line] of faqMap.entries()) {
    newLines.push(line);
  }

  // バックアップ作成
  const backupPath = tsvPath + '.backup';
  fs.copyFileSync(tsvPath, backupPath);
  console.log(`\n\nバックアップ作成: ${backupPath}`);

  // 更新
  fs.writeFileSync(tsvPath, newLines.join('\n'), 'utf8');

  console.log(`✓ FAQ更新完了`);
  console.log(`  成功: ${successCount}`);
  console.log(`  エラー: ${errorCount}`);
}

/**
 * Details TSVを更新
 */
async function updateDetailsTsv(cardIds: string[], cookieJar: string) {
  const tsvPath = path.join(__dirname, '..', 'output', 'data', 'details-all.tsv');

  console.log(`\n=== Details データ修正 (${cardIds.length}件) ===\n`);

  // 既存TSVを読み込み
  const content = fs.readFileSync(tsvPath, 'utf8');
  const lines = content.split('\n');
  const header = lines[0];

  // cardIdでマップを作成
  const cardMap = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cardId = line.split('\t')[0];
    if (cardId) {
      cardMap.set(cardId, line);
    }
  }

  let successCount = 0;
  let errorCount = 0;

  // 各カードを再取得
  for (let i = 0; i < cardIds.length; i++) {
    const cardId = cardIds[i];
    const progress = `[${i + 1}/${cardIds.length}]`;

    process.stdout.write(`\r${progress} Fetching card ${cardId}...`);

    const cardDetail = await fetchCardDetail(cardId, cookieJar);

    if (cardDetail) {
      const newLine = [
        cardDetail.cardId,
        escapeForTsv(cardDetail.cardName),
        escapeForTsv(cardDetail.supplementInfo),
        escapeForTsv(cardDetail.supplementDate),
        escapeForTsv(cardDetail.pendulumSupplementInfo),
        escapeForTsv(cardDetail.pendulumSupplementDate)
      ].join('\t');

      cardMap.set(cardId, newLine);
      successCount++;
    } else {
      errorCount++;
    }

    if (i < cardIds.length - 1) {
      await sleep(1000);
    }
  }

  // TSVを再構築
  const newLines = [header];
  for (const [cardId, line] of cardMap.entries()) {
    newLines.push(line);
  }

  // バックアップ作成
  const backupPath = tsvPath + '.backup';
  fs.copyFileSync(tsvPath, backupPath);
  console.log(`\n\nバックアップ作成: ${backupPath}`);

  // 更新
  fs.writeFileSync(tsvPath, newLines.join('\n'), 'utf8');

  console.log(`✓ Details更新完了`);
  console.log(`  成功: ${successCount}`);
  console.log(`  エラー: ${errorCount}`);
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('使い方: bun run src/fix-corrupted-data.ts <faq|details> <IDリストファイル>');
    console.error('例: bun run src/fix-corrupted-data.ts faq tmp/corrupted-faqids.txt');
    process.exit(1);
  }

  const type = args[0];
  const listFile = args[1];

  if (!fs.existsSync(listFile)) {
    console.error(`ファイルが見つかりません: ${listFile}`);
    process.exit(1);
  }

  // IDリストを読み込み
  const ids = fs.readFileSync(listFile, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line);

  console.log(`読み込んだID数: ${ids.length}`);

  // セッション確立
  const cookieJar = await establishSession();
  if (!cookieJar) {
    console.error('✗ セッションの確立に失敗しました');
    process.exit(1);
  }

  const startTime = Date.now();

  // タイプに応じて処理
  if (type === 'faq') {
    await updateFaqTsv(ids, cookieJar);
  } else if (type === 'details') {
    await updateDetailsTsv(ids, cookieJar);
  } else {
    console.error(`不明なタイプ: ${type}`);
    console.error('faq または details を指定してください');
    process.exit(1);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n総処理時間: ${totalTime}秒`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

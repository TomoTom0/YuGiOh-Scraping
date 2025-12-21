#!/usr/bin/env bun

/**
 * 既存TSVファイルのカラム数不足を修正
 * モンスターカードと魔法カードに不足している空フィールドを追加
 */

import * as fs from 'fs';
import * as path from 'path';

const TSV_PATH = path.join(import.meta.dir, '../output/data/cards-all.tsv');
const BACKUP_PATH = TSV_PATH + '.backup';

function fixTsvColumns() {
  console.log('=== TSVファイルのカラム数を修正します ===\n');

  if (!fs.existsSync(TSV_PATH)) {
    console.error('エラー: TSVファイルが見つかりません:', TSV_PATH);
    process.exit(1);
  }

  // バックアップを作成
  console.log('バックアップを作成中...');
  fs.copyFileSync(TSV_PATH, BACKUP_PATH);
  console.log(`  → ${BACKUP_PATH}`);

  // TSVファイルを読み込み
  const content = fs.readFileSync(TSV_PATH, 'utf8');
  const lines = content.split('\n');

  if (lines.length === 0) {
    console.error('エラー: TSVファイルが空です');
    process.exit(1);
  }

  const header = lines[0];
  const expectedFieldCount = header.split('\t').length;

  console.log(`\nヘッダーフィールド数: ${expectedFieldCount}`);

  let monsterFixed = 0;
  let spellFixed = 0;
  let trapOk = 0;
  let otherLines = 0;

  const fixedLines: string[] = [header]; // ヘッダーはそのまま

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      fixedLines.push(line);
      continue;
    }

    const fields = line.split('\t');
    const cardType = fields[0];

    if (cardType === 'monster') {
      if (fields.length === expectedFieldCount) {
        fixedLines.push(line);
        continue;
      }
      // モンスターカード: spellEffectType, trapEffectType を追加
      fields.push(''); // spellEffectType
      fields.push(''); // trapEffectType
      fixedLines.push(fields.join('\t'));
      monsterFixed++;
    } else if (cardType === 'spell') {
      if (fields.length === expectedFieldCount) {
        fixedLines.push(line);
        continue;
      }
      // 魔法カード: trapEffectType を追加
      fields.push(''); // trapEffectType
      fixedLines.push(fields.join('\t'));
      spellFixed++;
    } else if (cardType === 'trap') {
      fixedLines.push(line);
      trapOk++;
    } else {
      fixedLines.push(line);
      otherLines++;
    }
  }

  // 修正後のTSVを保存
  fs.writeFileSync(TSV_PATH, fixedLines.join('\n'), 'utf8');

  console.log('\n=== 修正完了 ===');
  console.log(`モンスターカード修正: ${monsterFixed}件`);
  console.log(`魔法カード修正: ${spellFixed}件`);
  console.log(`罠カード（正常）: ${trapOk}件`);
  if (otherLines > 0) {
    console.log(`その他: ${otherLines}件`);
  }
  console.log(`\n修正後TSV: ${TSV_PATH}`);
  console.log(`バックアップ: ${BACKUP_PATH}`);
}

fixTsvColumns();

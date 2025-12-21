import { describe, test, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

/**
 * TSVヘッダーのフィールド数を取得
 */
function getTsvHeaderFieldCount(): number {
  const header = [
    'cardType',
    'name',
    'nameModified',
    'ruby',
    'cardId',
    'ciid',
    'imgs',
    'text',
    'biko',
    'isNotLegalForOfficial',
    'attribute',
    'levelType',
    'levelValue',
    'race',
    'monsterTypes',
    'atk',
    'def',
    'linkMarkers',
    'pendulumScale',
    'pendulumText',
    'isExtraDeck',
    'spellEffectType',
    'trapEffectType'
  ];
  return header.length;
}

describe('TSVカラム数の整合性テスト', () => {
  const expectedFieldCount = getTsvHeaderFieldCount();

  test('ヘッダーは23フィールドである', () => {
    expect(expectedFieldCount).toBe(23);
  });

  test('既存のTSVファイルのヘッダーが正しいフィールド数である', () => {
    const tsvPath = path.join(__dirname, '../../output/data/cards-all.tsv');

    if (!fs.existsSync(tsvPath)) {
      console.warn('TSVファイルが存在しません。テストをスキップします。');
      return;
    }

    const content = fs.readFileSync(tsvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      console.warn('TSVファイルが空です。テストをスキップします。');
      return;
    }

    const headerFields = lines[0].split('\t');
    expect(headerFields.length).toBe(expectedFieldCount);
  });

  test('モンスターカードのデータ行が正しいフィールド数である', () => {
    const tsvPath = path.join(__dirname, '../../output/data/cards-all.tsv');

    if (!fs.existsSync(tsvPath)) {
      console.warn('TSVファイルが存在しません。テストをスキップします。');
      return;
    }

    const content = fs.readFileSync(tsvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.warn('TSVファイルにデータがありません。テストをスキップします。');
      return;
    }

    // モンスターカードの行を検索
    const monsterLines = lines.slice(1).filter(line => line.startsWith('monster\t'));

    if (monsterLines.length === 0) {
      console.warn('モンスターカードが見つかりません。テストをスキップします。');
      return;
    }

    // 最初のモンスターカードをテスト
    const fields = monsterLines[0].split('\t');
    expect(fields.length).toBe(expectedFieldCount);
  });

  test('魔法カードのデータ行が正しいフィールド数である', () => {
    const tsvPath = path.join(__dirname, '../../output/data/cards-all.tsv');

    if (!fs.existsSync(tsvPath)) {
      console.warn('TSVファイルが存在しません。テストをスキップします。');
      return;
    }

    const content = fs.readFileSync(tsvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.warn('TSVファイルにデータがありません。テストをスキップします。');
      return;
    }

    // 魔法カードの行を検索
    const spellLines = lines.slice(1).filter(line => line.startsWith('spell\t'));

    if (spellLines.length === 0) {
      console.warn('魔法カードが見つかりません。テストをスキップします。');
      return;
    }

    // 最初の魔法カードをテスト
    const fields = spellLines[0].split('\t');
    expect(fields.length).toBe(expectedFieldCount);
  });

  test('罠カードのデータ行が正しいフィールド数である', () => {
    const tsvPath = path.join(__dirname, '../../output/data/cards-all.tsv');

    if (!fs.existsSync(tsvPath)) {
      console.warn('TSVファイルが存在しません。テストをスキップします。');
      return;
    }

    const content = fs.readFileSync(tsvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.warn('TSVファイルにデータがありません。テストをスキップします。');
      return;
    }

    // 罠カードの行を検索
    const trapLines = lines.slice(1).filter(line => line.startsWith('trap\t'));

    if (trapLines.length === 0) {
      console.warn('罠カードが見つかりません。テストをスキップします。');
      return;
    }

    // 最初の罠カードをテスト
    const fields = trapLines[0].split('\t');
    expect(fields.length).toBe(expectedFieldCount);
  });
});

describe('TSVカラム内容の整合性テスト', () => {
  test('モンスターカードのattributeカラムに属性値が入っている', () => {
    const tsvPath = path.join(__dirname, '../../output/data/cards-all.tsv');

    if (!fs.existsSync(tsvPath)) {
      console.warn('TSVファイルが存在しません。テストをスキップします。');
      return;
    }

    const content = fs.readFileSync(tsvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.warn('TSVファイルにデータがありません。テストをスキップします。');
      return;
    }

    const header = lines[0].split('\t');
    const attributeIndex = header.indexOf('attribute');

    expect(attributeIndex).toBeGreaterThanOrEqual(0);

    // モンスターカードの行を検索
    const monsterLines = lines.slice(1).filter(line => line.startsWith('monster\t'));

    if (monsterLines.length === 0) {
      console.warn('モンスターカードが見つかりません。テストをスキップします。');
      return;
    }

    const fields = monsterLines[0].split('\t');
    const attributeValue = fields[attributeIndex];

    // 有効な属性値のリスト
    const validAttributes = ['light', 'dark', 'water', 'fire', 'earth', 'wind', 'divine'];

    expect(validAttributes).toContain(attributeValue);
  });

  test('モンスターカードのraceカラムに種族値が入っている', () => {
    const tsvPath = path.join(__dirname, '../../output/data/cards-all.tsv');

    if (!fs.existsSync(tsvPath)) {
      console.warn('TSVファイルが存在しません。テストをスキップします。');
      return;
    }

    const content = fs.readFileSync(tsvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.warn('TSVファイルにデータがありません。テストをスキップします。');
      return;
    }

    const header = lines[0].split('\t');
    const raceIndex = header.indexOf('race');

    expect(raceIndex).toBeGreaterThanOrEqual(0);

    // モンスターカードの行を検索
    const monsterLines = lines.slice(1).filter(line => line.startsWith('monster\t'));

    if (monsterLines.length === 0) {
      console.warn('モンスターカードが見つかりません。テストをスキップします。');
      return;
    }

    const fields = monsterLines[0].split('\t');
    const raceValue = fields[raceIndex];

    // 種族値は文字列であり、数値ではないことを確認
    expect(raceValue).toBeTruthy();
    expect(isNaN(Number(raceValue)) || raceValue.includes('[')).toBe(true);
  });

  test('モンスターカードのlevelTypeカラムにレベルタイプが入っている', () => {
    const tsvPath = path.join(__dirname, '../../output/data/cards-all.tsv');

    if (!fs.existsSync(tsvPath)) {
      console.warn('TSVファイルが存在しません。テストをスキップします。');
      return;
    }

    const content = fs.readFileSync(tsvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.warn('TSVファイルにデータがありません。テストをスキップします。');
      return;
    }

    const header = lines[0].split('\t');
    const levelTypeIndex = header.indexOf('levelType');

    expect(levelTypeIndex).toBeGreaterThanOrEqual(0);

    // モンスターカードの行を検索
    const monsterLines = lines.slice(1).filter(line => line.startsWith('monster\t'));

    if (monsterLines.length === 0) {
      console.warn('モンスターカードが見つかりません。テストをスキップします。');
      return;
    }

    const fields = monsterLines[0].split('\t');
    const levelTypeValue = fields[levelTypeIndex];

    // 有効なレベルタイプ
    const validLevelTypes = ['level', 'rank', 'link'];

    expect(validLevelTypes).toContain(levelTypeValue);
  });
});

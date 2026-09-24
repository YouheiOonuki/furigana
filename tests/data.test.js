// 字の一覧・追加辞書・定数のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CONSTANTS = require('../constants.js');
const Calc = require('../calc.js');

test('constants: すべての値に出典と確認日がある', () => {
  for (const [key, c] of Object.entries(CONSTANTS)) {
    assert.ok(c.source && c.url && c.checked, `${key} に source / url / checked が無い`);
    assert.match(c.checked, /^\d{4}-\d{2}-\d{2}$/, `${key} の checked は YYYY-MM-DD`);
  }
});

test('学年別漢字配当表: 学年ごとの字数 80・160・200・202・193・191、計 1,026 字・重複なし', () => {
  const g = CONSTANTS.kanjiByGrade.value;
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => Array.from(g[n]).length), [80, 160, 200, 202, 193, 191]);
  const all = Object.values(g).join('');
  assert.equal(new Set(Array.from(all)).size, 1026);
});

test('学年別漢字配当表: gakushu-print と同じ（写しのずれを検出。gakushu-print が隣に無ければ飛ばす）', (t) => {
  const p = path.join(__dirname, '..', '..', 'gakushu-print', 'constants.js');
  if (!fs.existsSync(p)) { t.skip('gakushu-print が無い'); return; }
  const other = require(p);
  assert.deepEqual(CONSTANTS.kanjiByGrade.value, other.kanjiByGrade.value);
});

test('常用漢字表: 2,136 字・重複なし・配当表の字をすべて含む', () => {
  const j = Array.from(CONSTANTS.joyoKanji.value);
  assert.equal(j.length, 2136);
  assert.equal(new Set(j).size, 2136);
  for (const ch of Object.values(CONSTANTS.kanjiByGrade.value).join('')) assert.ok(j.includes(ch), ch);
  // 2010 年に加わった字と、付記で同じ字とされる 叱
  for (const ch of ['𠮟', '剝', '頰', '塡', '俺', '嵐']) assert.ok(j.includes(ch), ch);
  assert.equal(CONSTANTS.joyoKanji.sameAs['叱'], '𠮟');
});

test('字の段階: 1〜6 = 学年、7 = 常用（中学）、8 = 常用漢字表にない字', () => {
  const lv = Calc.buildLevels(CONSTANTS);
  assert.equal(Calc.wordLevel(lv, '一'), 1);
  assert.equal(Calc.wordLevel(lv, '毛'), 2);
  assert.equal(Calc.wordLevel(lv, '猫'), 7);   // 猫 は配当表に無い（中学で習う常用漢字）
  assert.equal(Calc.wordLevel(lv, '岐阜'), 4);
  assert.equal(Calc.wordLevel(lv, '汗'), 7);
  assert.equal(Calc.wordLevel(lv, '叱'), 7);
  assert.equal(Calc.wordLevel(lv, '薔薇'), 8);
  assert.equal(Calc.wordLevel(lv, '人々'), 1);   // 々 は数えない
  assert.equal(Calc.wordLevel(lv, 'ねこ'), 0);
});

test('追加辞書: 地名と複合語（200 語まで）があり、読みはすべてひらがな', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'extra-dict.json'), 'utf8'));
  const e = Object.entries(d.entries);
  assert.ok(d.counts.places > 1800, '地名 ' + d.counts.places);
  assert.ok(d.counts.compounds > 0 && d.counts.compounds <= 200, '複合語 ' + d.counts.compounds);
  for (const [k, [r, f]] of e) {
    assert.ok(Calc.hasKanji(k), k);
    assert.match(r, /^[ぁ-ゖー]+$/, k + ' ' + r);
    assert.ok(['', 'p', 'a'].includes(f), k);
  }
  assert.equal(d.entries['八王子市'][0], 'はちおうじし');
  assert.equal(d.entries['名寄市'][0], 'なよろし');       // 解析器は なよせし と読む（企画書 4.3）
  assert.equal(d.entries['月形町'][0], 'つきがたちょう');  // 町 の まち／ちょう
  assert.equal(d.entries['東京都'][0], 'とうきょうと');
  assert.equal(d.entries['三毛猫'][0], 'みけねこ');
  // 同じ表記で読みが割れる地名（朝日町など）は入れない
  assert.ok(d.placesDropped.includes('朝日町'));
  assert.equal(d.entries['朝日町'], undefined);
});

test('読み分けのある語: constants.js の表は tools/ambiguous-verified.tsv（辞書で確かめたもの）と同じで、どれも読みが 2 つ以上・出典 URL つき', () => {
  const rows = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ambiguous-verified.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  const fromTsv = Object.fromEntries(rows.map((r) => [r[0], r[1].split(',')]));
  assert.deepEqual(CONSTANTS.ambiguousReadings.value, fromTsv);
  for (const r of rows) {
    assert.ok(r[1].split(',').length >= 2, r[0]);
    assert.match(r[3], /^https:\/\/kotobank\.jp\/word\//, r[0]);
    assert.ok(Calc.hasKanji(r[0]) && r[1].split(',').every((x) => /^[ぁ-ゖー]+$/.test(x)), r[0]);
  }
});

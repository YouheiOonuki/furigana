// 端末の辞書・設定・バックアップ（D31）・入力の上限・ブックマークレット（D73）のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const Calc = require('../calc.js');

test('端末の辞書: 漢字を含む表記とかなの読みだけ残す。カタカナはひらがなに。"" は「振らない」', () => {
  const d = Calc.normalizeUserDict({ 額: 'ヒタイ', 大勢: 'おおぜい', 三毛猫: '', abc: 'えー', 猫: 'neko', 犬: 5, ['長'.repeat(40)]: 'ながい', '<b>': 'x' });
  assert.deepEqual(d, { 額: 'ひたい', 大勢: 'おおぜい', 三毛猫: '' });
  assert.deepEqual(Calc.normalizeUserDict(null), {});
  assert.deepEqual(Calc.normalizeUserDict([1, 2]), {});
  assert.equal(Calc.cleanReading(' ひ た い '), 'ひたい');
  assert.equal(Calc.cleanReading('hitai'), null);
  assert.equal(Calc.cleanReading(''), null);
});

test('設定の正規化', () => {
  assert.deepEqual(Calc.normalizeSettings({ reader: '3', size: 'xl', script: 'romaji', format: 'aozora', credit: false }),
    { reader: 3, showMarks: true, printMarks: false, size: 'xl', vertical: false, script: 'romaji', credit: false, format: 'aozora' });
  assert.equal(Calc.normalizeSettings({ reader: 99 }).reader, 0);
  assert.equal(Calc.normalizeSettings(null).format, 'html');
});

test('バックアップ: 書き出し → 読み込み。ほかのツール・新しい版・中身の欠けは断る', () => {
  const data = { dict: { 額: 'ひたい' }, settings: Calc.normalizeSettings({}), text: '三毛猫' };
  const b = Calc.buildBackup('furigana', data, new Date('2026-09-24T01:02:03Z'));
  assert.equal(Calc.backupFileName('furigana', new Date(2026, 8, 24)), 'furigana-backup-20260924.json');
  const r = Calc.parseBackup(JSON.stringify(b), 'furigana', ['dict']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, data);
  assert.equal(Calc.parseBackup('{', 'furigana').ok, false);
  assert.match(Calc.parseBackup(JSON.stringify({ ...b, tool: 'loan-sim' }), 'furigana').error, /loan-sim/);
  assert.match(Calc.parseBackup(JSON.stringify({ ...b, version: 2 }), 'furigana').error, /新しい版/);
  assert.equal(Calc.parseBackup(JSON.stringify({ ...b, data: {} }), 'furigana', ['dict']).ok, false);
});

test('入力の上限: 10,000 字で切り、切った字数を返す', () => {
  assert.deepEqual(Calc.clampInput('あ'.repeat(10)), { text: 'あ'.repeat(10), cut: 0 });
  const r = Calc.clampInput('あ'.repeat(10005));
  assert.equal(r.text.length, 10000);
  assert.equal(r.cut, 5);
});

// ブックマークレットを、偽のページ（選んだ文字・window.open）で実際に動かす
function runBookmarklet(href, { selection = '', bodyText = '', mainText = null }) {
  assert.ok(href.startsWith('javascript:'));
  const src = decodeURIComponent(href.slice('javascript:'.length));
  const opened = [];
  const listeners = [];
  const fakeWin = { posted: [], postMessage(msg, origin) { this.posted.push({ msg, origin }); } };
  const ctx = {
    getSelection: () => ({ toString: () => selection }),
    document: {
      querySelector: () => (mainText == null ? null : { innerText: mainText }),
      body: { innerText: bodyText },
    },
    encodeURIComponent, String, JSON,
  };
  ctx.window = {
    getSelection: ctx.getSelection,
    open: (u, target) => { opened.push({ u, target }); return fakeWin; },
    addEventListener: (type, f) => listeners.push(f),
    removeEventListener: () => {},
  };
  vm.runInNewContext(src, ctx);
  return { opened, listeners, fakeWin };
}

test('ブックマークレット: 選んだ文字を #t= で新しいタブに渡す（相手のページには書き込まない）', () => {
  const href = Calc.makeBookmarklet('https://yorozu-craft.com/furigana/');
  const { opened } = runBookmarklet(href, { selection: '  三毛猫が大勢いる。 ' });
  assert.equal(opened.length, 1);
  assert.equal(opened[0].target, '_blank');
  assert.ok(opened[0].u.startsWith('https://yorozu-craft.com/furigana/#t='));
  const hash = opened[0].u.slice(opened[0].u.indexOf('#'));
  assert.equal(Calc.readHashText(hash), '三毛猫が大勢いる。');
});

test('ブックマークレット: 選んでいなければ本文（main があれば main）。長い文は postMessage で、準備できた合図の後に渡す', () => {
  const href = Calc.makeBookmarklet('https://yorozu-craft.com/furigana/');
  assert.equal(Calc.readHashText(runBookmarklet(href, { bodyText: 'ページの本文' }).opened[0].u.replace(/^[^#]*/, '')), 'ページの本文');
  assert.equal(Calc.readHashText(runBookmarklet(href, { bodyText: 'x', mainText: '記事の本文' }).opened[0].u.replace(/^[^#]*/, '')), '記事の本文');
  const long = '漢'.repeat(12000);
  const { opened, listeners, fakeWin } = runBookmarklet(href, { selection: long });
  assert.equal(opened[0].u, 'https://yorozu-craft.com/furigana/#pm');
  // ほかのオリジン・ほかの窓からの合図は無視
  listeners[0]({ origin: 'https://evil.example', source: fakeWin, data: { type: 'furigana-ready' } });
  listeners[0]({ origin: 'https://yorozu-craft.com', source: {}, data: { type: 'furigana-ready' } });
  assert.equal(fakeWin.posted.length, 0);
  listeners[0]({ origin: 'https://yorozu-craft.com', source: fakeWin, data: { type: 'furigana-ready' } });
  assert.equal(fakeWin.posted.length, 1);
  assert.equal(fakeWin.posted[0].origin, 'https://yorozu-craft.com');
  assert.equal(fakeWin.posted[0].msg.text.length, Calc.MAX_CHARS);   // 10,000 字で切る
});

test('#t= の読み取り: 壊れた値は null、上限で切る', () => {
  assert.equal(Calc.readHashText('#t=%E0%A4%A'), null);
  assert.equal(Calc.readHashText('#s=abc'), null);
  assert.equal(Calc.readHashText('#t=' + encodeURIComponent('あ'.repeat(10010))).length, 10000);
});

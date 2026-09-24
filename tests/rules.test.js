// 解析器（lindera + IPADIC）の出力に、ツールの規則（振る・振らない・学年・語ごと・印・直した読み）を通したときのテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const { Calc, analyse, unitOf, rawTokens } = require('./helpers.js');

// 企画書 3 章の試し文（正解: みけねこ・おおぜい・ひたい・はちおうじし）
const S = '三毛猫が大勢の前で額に汗をかいた。八王子市の図書館へ行く方法を調べる。';

test('トークンの位置合わせ: 空白・改行・記号があっても、各トークンが本文の同じ位置を指す', () => {
  const text = '　今日は、晴れ。\n\n明日は ABC 123 の雨。\n𠮷野家へ。';
  const toks = Calc.alignTokens(text, rawTokens(text));
  assert.ok(toks.length > 8);
  for (const t of toks) assert.equal(text.slice(t.start, t.end), t.s);
  for (let i = 1; i < toks.length; i++) assert.ok(toks[i].start >= toks[i - 1].end);
});

test('試し文: 三毛猫 みけねこ・大勢 おおぜい（読み分けあり）・八王子市 はちおうじし（追加辞書）', () => {
  const u = analyse(S);
  assert.equal(unitOf(u, '三毛猫').reading, 'みけねこ');
  assert.equal(unitOf(u, '三毛猫').mark, '');
  assert.equal(unitOf(u, '大勢').reading, 'おおぜい');
  assert.equal(unitOf(u, '大勢').mark, 'amb');      // たいせい とも読むので印は残す
  assert.equal(unitOf(u, '八王子市').reading, 'はちおうじし');
  assert.equal(unitOf(u, '八王子市').src, 'place');
  assert.equal(unitOf(u, '図書館').reading, 'としょかん');
  assert.equal(unitOf(u, '図書館').mark, '');
  assert.deepEqual(unitOf(u, '行く').segs, [{ b: '行', r: 'い' }, { b: 'く' }]);   // 送り仮名はルビの外
  assert.deepEqual(unitOf(u, '調べる').segs, [{ b: '調', r: 'しら' }, { b: 'べる' }]);
});

test('額: 辞書は「がく」と読む（文脈で ひたい／がく が決まる）→ 1 字の語なので印つき。直すと ひたい になり、次の文にも効く', () => {
  const u = analyse(S);
  assert.equal(unitOf(u, '額').reading, 'がく');
  assert.equal(unitOf(u, '額').mark, 'one');
  const u2 = analyse('額縁に入れた額を壁に掛けた。', {});
  assert.equal(unitOf(u2, '額縁').reading, 'がくぶち');
  assert.equal(unitOf(u2, '額').mark, 'one');
  // タップで直した読み（端末の辞書）
  const user = Calc.normalizeUserDict({ 額: 'ひたい' });
  const u3 = analyse('額に汗して働く。', { user });
  assert.equal(unitOf(u3, '額').reading, 'ひたい');
  assert.equal(unitOf(u3, '額').mark, '');
  assert.equal(unitOf(u3, '額').src, 'user');
  // 額縁 は別の語なので影響を受けない
  assert.equal(unitOf(analyse('額縁を買う。', { user }), '額縁').reading, 'がくぶち');
});

test('追加辞書なし: 三毛猫は割れて さんもうねこ（印 split）、八王子は固有名詞で振らない', () => {
  const u = analyse(S, { noExtra: true });
  assert.equal(unitOf(u, '三毛猫').reading, 'さんもうねこ');
  assert.equal(unitOf(u, '三毛猫').mark, 'split');
  assert.equal(unitOf(u, '大勢').reading, 'たいせい');
  assert.equal(unitOf(u, '八王子').skip, 'proper');
  assert.equal(unitOf(u, '八王子').ruby, false);
});

test('学年（D69）: N 年生には N 年生の字から上を振る。0・1 はすべて', () => {
  const r = (reader, w) => unitOf(analyse(S, { reader }), w).ruby;
  // 方法 = 方(2)・法(4)
  assert.equal(r(0, '方法'), true);
  assert.equal(r(1, '方法'), true);
  assert.equal(r(4, '方法'), true);
  assert.equal(r(5, '方法'), false);
  // 三毛猫 = 三(1)・毛(2)・猫(常用・中学)。猫 があるので 6 年生にも語ごと振る
  assert.equal(r(6, '三毛猫'), true);
  assert.equal(r(8, '三毛猫'), false);
  // 汗 は常用（中学）: 中学生（7）までは振る、大人（8）には振らない
  assert.equal(r(6, '汗'), true);
  assert.equal(r(7, '汗'), true);
  assert.equal(r(8, '汗'), false);
  // 大人には常用漢字表にない字だけ
  assert.equal(unitOf(analyse('薔薇が咲く。', { reader: 8 }), '薔薇').ruby, true);
  assert.equal(Calc.needsRuby(0, 0), false);
});

test('語ごと振る（D69）: 図書館 = 図(2)・書(2)・館(3)。3 年生には 図書 も含めて としょかん と振る。4 年生には振らない', () => {
  const u3 = unitOf(analyse(S, { reader: 3 }), '図書館');
  assert.equal(u3.ruby, true);
  assert.deepEqual(u3.segs, [{ b: '図書館', r: 'としょかん' }]);
  assert.equal(unitOf(analyse(S, { reader: 4 }), '図書館').ruby, false);
  // 送り仮名つきの語も語ごと: 調べる（調 = 3 年）
  assert.equal(unitOf(analyse(S, { reader: 3 }), '調べる').ruby, true);
  assert.equal(unitOf(analyse(S, { reader: 4 }), '調べる').ruby, false);
});

test('印（D70）: 1 字だけの漢字の語・割れた複合語・読み分けのある語。送り仮名つきの 1 字の語は印なし', () => {
  const u = analyse(S, { noExtra: true });
  assert.equal(unitOf(u, '前').mark, 'one');
  assert.equal(unitOf(u, '汗').mark, 'one');
  assert.equal(unitOf(u, '三毛猫').mark, 'split');
  assert.equal(unitOf(u, '行く').mark, '');
  assert.equal(unitOf(u, '方法').mark, '');
  const s = Calc.summarize(u);
  assert.ok(s.marked >= 4 && s.ruby > s.marked);
});

test('振らないもの: 未知語・固有名詞。直した読みで「振らない」も選べる', () => {
  const u = analyse('𠮷野家とＸ社へ、山田太郎さんが行く。');
  for (const w of u.filter((x) => x.word && x.skip)) assert.equal(w.ruby, false);
  assert.ok(u.some((x) => x.skip === 'proper'));
  const user = { 三毛猫: '' };
  assert.equal(unitOf(analyse(S, { user }), '三毛猫').skip, 'user');
  assert.equal(unitOf(analyse(S, { user }), '三毛猫').ruby, false);
});

test('日付: 算用数字の後の 月 は がつ、日 は日付の読み（1 日は読み分けあり）', () => {
  const u = analyse('4月10日（金）と5月1日と6月15日に集まります。');
  assert.equal(u.filter((x) => x.text === '月').every((x) => x.reading === 'がつ'), true);
  assert.equal(unitOf(u, '10日').reading, 'とおか');
  assert.equal(unitOf(u, '1日').reading, 'ついたち');
  assert.equal(unitOf(u, '1日').mark, 'amb');
  assert.equal(unitOf(u, '日').reading, 'にち');   // 15日 は 15 + にち
  // 地の文と語の単位をつなぐと本文に戻る
  assert.equal(u.map((x) => x.text).join(''), '4月10日（金）と5月1日と6月15日に集まります。');
});

test('単位をつなぐと、どの設定でも本文に戻る', () => {
  const text = '今日は\n  晴れ。\r\n明日（あした）は　雨かな？ 123 ABC 𠮷\n';
  for (const reader of [0, 3, 8]) assert.equal(analyse(text, { reader }).map((x) => x.text).join(''), text);
});

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

// --- 2026-09-24 オーナーが青空文庫の文を貼って見つけたもの ---
const EXCERPT = '俄かにぎょっとして立停まった。青山百人町の組屋敷。そのあとを追って行った。ひとすじ道のうしろから。家へ帰って詮議すると。無暗に掻き分けて。さっき御成道で見かけた。路が開けているばかり。';

test('送り仮名の重なり: 辞書の見出しに送り仮名が無い語（俄 = にわか）の後に本文の か が続くとき、ルビは漢字の分だけ（俄 → にわ）', () => {
  const u = analyse('俄かに雨が降った。');
  assert.equal(unitOf(u, '俄').reading, 'にわ');
  assert.deepEqual(unitOf(u, '俄').segs, [{ b: '俄', r: 'にわ' }]);
  assert.equal(Calc.toAozora(Calc.toPieces(u)).slice(0, 8), '｜俄《にわ》かに');
  assert.equal(Calc.toBrackets(Calc.toPieces(u)).slice(0, 7), '俄（にわ）かに');
  // 古い送り仮名（身近か・短かい・疑ぐる）も同じ。漢字 2 字以上で外したときは印 okuri
  assert.equal(unitOf(analyse('身近かな人'), '身近').reading, 'みぢ');
  assert.equal(unitOf(analyse('身近かな人'), '身近').mark, 'okuri');
  assert.equal(unitOf(analyse('短かい'), '短').reading, 'みじ');
  assert.equal(unitOf(analyse('疑ぐる'), '疑').reading, 'うた');
});

test('送り仮名の重なり: 送り仮名を含む見出し（確か・静か・僅か・愚か）はそのまま。名詞の後の助詞（中から・今まで・お金ね）は外さない', () => {
  const seg = (s, w) => unitOf(analyse(s), w).segs;
  assert.deepEqual(seg('確かに', '確か'), [{ b: '確', r: 'たし' }, { b: 'か' }]);
  assert.deepEqual(seg('静かな夜', '静か'), [{ b: '静', r: 'しず' }, { b: 'か' }]);
  assert.deepEqual(seg('僅かな差', '僅か'), [{ b: '僅', r: 'わず' }, { b: 'か' }]);
  assert.deepEqual(seg('愚かな話', '愚か'), [{ b: '愚', r: 'おろ' }, { b: 'か' }]);
  assert.equal(unitOf(analyse('箱の中から'), '中').reading, 'なか');
  assert.equal(unitOf(analyse('今まで'), '今').reading, 'いま');
  assert.equal(unitOf(analyse('お金ね'), 'お金').reading, 'おかね');
  assert.equal(unitOf(analyse('この子こそ'), '子').reading, 'こ');
});

test('割れた語: 漢字どうしが語の切れ目で接していれば両側に印（無暗に → 無 / 暗に）', () => {
  const u = analyse('無暗に掻き分けて進む。');
  assert.equal(unitOf(u, '無').mark, 'one');
  assert.equal(unitOf(u, '暗に').mark, 'split');
  assert.equal(unitOf(u, '暗に').ruby, true);
  // 1 つのトークンなら印なし。仮名をはさめば続かない
  assert.equal(unitOf(analyse('無理に掻き分けて'), '無理').mark, '');
  assert.equal(unitOf(analyse('家へ帰って'), '帰っ').mark, '');
});

test('読み分けのある語（tools/ambiguous-verified.tsv）: 読みは変えずに印 amb を付け、ほかの読みを持たせる', () => {
  const u = analyse('そのあとを追って行った。');
  assert.equal(unitOf(u, '行っ').mark, 'amb');
  assert.equal(unitOf(u, '行っ').reading, 'おこなっ');           // 解析器の読みは変えない（印で知らせる）
  assert.deepEqual(unitOf(u, '行っ').alts, ['いっ', 'おこなっ']);
  const v = analyse('学校へ行って、窓を開けて、上手に絵を描いた。下手の袖に色紙がある。');
  assert.equal(unitOf(v, '行っ').reading, 'いっ');
  assert.equal(unitOf(v, '行っ').mark, 'amb');
  assert.equal(unitOf(v, '開け').mark, 'amb');
  assert.deepEqual(unitOf(v, '開け').alts, ['あけ', 'ひらけ']);
  assert.equal(unitOf(v, '上手').mark, 'amb');
  assert.equal(unitOf(v, '下手').mark, 'amb');
  assert.deepEqual(unitOf(v, '下手').alts, ['へた', 'したて', 'しもて']);
  assert.equal(unitOf(v, '色紙').mark, 'amb');
  // 割れた語（一 / 日）や追加辞書の語（一日）でも当たる
  const w = analyse('その一日は長かった。');
  assert.equal(unitOf(w, '一日').mark, 'amb');
  assert.deepEqual(unitOf(w, '一日').alts, ['ついたち', 'いちにち', 'いちじつ']);
  // 追加辞書の語の隣は割れた語として数えない（一日中 | 歩いた）
  assert.equal(unitOf(analyse('一日中歩いた。'), '歩い').mark, '');
  // 表にない語は印なしのまま
  assert.equal(unitOf(v, '学校').mark, '');
  // 表を渡さなければ印は付かない（以前と同じ）
  assert.equal(unitOf(analyse('追って行った。', { noAmb: true }), '行っ').mark, '');
});

test('オーナーの抜き出し（青空文庫）: 俄 → にわ、無暗 は両方に印、行っ・開け に印。自信のない読みは印なしで出さない', () => {
  const u = analyse(EXCERPT);
  assert.equal(u.map((x) => x.text).join(''), EXCERPT);
  const got = (w) => { const x = unitOf(u, w); return x.reading + (x.mark ? '[' + x.mark + ']' : ''); };
  assert.equal(got('俄'), 'にわ[one]');
  assert.equal(got('立停'), 'りつとま[split]');
  assert.equal(got('町'), 'まち[one]');
  assert.equal(got('追って'), 'おって');
  assert.equal(got('行っ'), 'おこなっ[amb]');
  assert.equal(got('道'), 'どう[one]');
  assert.equal(got('無'), 'む[one]');
  assert.equal(got('暗に'), 'あんに[split]');
  assert.equal(got('御成道'), 'ごじょうどう[split]');
  assert.equal(got('開け'), 'あけ[amb]');
  assert.ok(!Calc.toHiraganaOnly(Calc.toPieces(u)).includes('にわかか'));
});

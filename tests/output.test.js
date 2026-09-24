// 出力の形式（HTML の <ruby>・青空文庫形式・括弧・ひらがなだけ・ローマ字）と往復のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const { Calc, analyse } = require('./helpers.js');

const S = '三毛猫が大勢の前で額に汗をかいた。\n八王子市の図書館へ行く方法を調べる。';
const strip = (ps) => ps.map((p) => (p.t != null ? { t: p.t } : { b: p.b, r: p.r }));

test('HTML の <ruby>: 送り仮名は外、rp つき、改行は <br>、読み戻すと同じ', () => {
  const p = Calc.toPieces(analyse(S), 'hiragana');
  const html = Calc.toHtml(p);
  assert.match(html, /<ruby>三毛猫<rp>\(<\/rp><rt>みけねこ<\/rt><rp>\)<\/rp><\/ruby>が/);
  assert.match(html, /<ruby>行<rp>\(<\/rp><rt>い<\/rt><rp>\)<\/rp><\/ruby>く/);
  assert.match(html, /<br>\n/);
  assert.deepEqual(Calc.parseHtmlRuby(html), strip(p));
  // 記号はエスケープ
  assert.equal(Calc.toHtml([{ t: '<a>&"' }]), '&lt;a&gt;&amp;&quot;');
});

test('青空文庫形式: ｜漢字《かんじ》。本文の ｜《》 は ※ で逃がす。読み戻すと同じ', () => {
  const p = Calc.toPieces(analyse(S), 'hiragana');
  const a = Calc.toAozora(p);
  assert.ok(a.startsWith('｜三毛猫《みけねこ》が｜大勢《おおぜい》の'));
  assert.deepEqual(Calc.parseAozora(a), strip(p));
  const q = [{ t: '記号《》と｜' }, { b: '漢字', r: 'かんじ' }];
  assert.deepEqual(Calc.parseAozora(Calc.toAozora(q)), q);
});

test('括弧: 漢字（かんじ）。直前が漢字でないときは読み戻せる。漢字が続き片方だけ振ったときは戻せない（使い方ページに記載）', () => {
  const p = Calc.toPieces(analyse(S), 'hiragana');
  const b = Calc.toBrackets(p);
  assert.ok(b.startsWith('三毛猫（みけねこ）が大勢（おおぜい）の前（まえ）で'));
  assert.deepEqual(Calc.parseBrackets(b), strip(p));
  const amb = [{ t: '山' }, { b: '川', r: 'かわ' }];
  assert.notDeepEqual(Calc.parseBrackets(Calc.toBrackets(amb)), amb);
});

test('ひらがなだけ: 振る語を読みに置き換え、学年で振らない字は漢字のまま', () => {
  assert.equal(Calc.toHiraganaOnly(Calc.toPieces(analyse(S), 'hiragana')),
    'みけねこがおおぜいのまえでがくにあせをかいた。\nはちおうじしのとしょかんへいくほうほうをしらべる。');
  const g4 = Calc.toHiraganaOnly(Calc.toPieces(analyse(S, { reader: 4 }), 'hiragana'));
  assert.ok(g4.includes('図書館') && g4.includes('あせ'));
});

test('ローマ字（ヘボン式・長音記号）', () => {
  const cases = { とうきょう: 'tōkyō', がっこう: 'gakkō', まっちゃ: 'matcha', きんえん: "kin'en", おおきい: 'ōkii', しんぶん: 'shinbun',
    らーめん: 'rāmen', せんせい: 'sensei', おかあさん: 'okāsan', みけねこ: 'mikeneko', ちゅうい: 'chūi', ふじさん: 'fujisan', じてんしゃ: 'jitensha' };
  for (const [k, v] of Object.entries(cases)) assert.equal(Calc.toRomaji(k), v, k);
  assert.equal(Calc.toRomaji('おもう', true), 'omou');   // 動詞の終わりの う
  const p = Calc.toPieces(analyse('東京の学校へ行く。'), 'romaji');
  assert.deepEqual(p.filter((x) => x.r).map((x) => x.r), ['tōkyō', 'gakkō', 'i']);
});

test('印の情報は pieces に残る（画面は点線、印刷は設定しだい）', () => {
  const p = Calc.toPieces(analyse(S), 'hiragana');
  assert.equal(p.find((x) => x.b === '額').mark, 'one');
  assert.equal(p.find((x) => x.b === '大勢').mark, 'amb');
  assert.equal(p.find((x) => x.b === '三毛猫').mark, '');
});

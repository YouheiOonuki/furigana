// ページの決まり（README「ツールを追加するとき」22・23）: hreflang の対・英語ページの共通ページ・印刷の着地ページ
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const BASE = 'https://yorozu-craft.com/furigana/';

const PAIRS = [['index.html', 'en/index.html', '', 'en/'], ['guide.html', 'en/guide.html', 'guide.html', 'en/guide.html']];

test('hreflang: 日英の対が両方向に同じ 3 行（ja・en・x-default）', () => {
  for (const [ja, en, jaUrl, enUrl] of PAIRS) {
    for (const f of [ja, en]) {
      const s = read(f);
      assert.ok(s.includes(`<link rel="alternate" hreflang="ja" href="${BASE}${jaUrl}">`), f + ' ja');
      assert.ok(s.includes(`<link rel="alternate" hreflang="en" href="${BASE}${enUrl}">`), f + ' en');
      assert.ok(s.includes(`<link rel="alternate" hreflang="x-default" href="${BASE}${jaUrl}">`), f + ' x-default');
    }
    assert.ok(read(ja).includes(`<link rel="canonical" href="${BASE}${jaUrl}">`));
    assert.ok(read(en).includes(`<link rel="canonical" href="${BASE}${enUrl}">`));
    assert.match(read(en), /<html lang="en">/);
  }
});

test('英語ページのフッターは英語の共通ページへ（日本語の共通ページには向けない）', () => {
  for (const f of ['en/index.html', 'en/guide.html']) {
    const s = read(f);
    assert.ok(s.includes('href="../../en/about.html"') && s.includes('href="../../en/privacy-policy.html"'), f);
    assert.ok(!/href="\.\.\/\.\.\/about\.html"/.test(s), f);
  }
});

test('AdSense とビーコンが全ページに 1 つずつ', () => {
  for (const f of ['index.html', 'guide.html', 'en/index.html', 'en/guide.html', 'print/index.html', '404.html']) {
    const s = read(f);
    assert.equal((s.match(/cloudflareinsights\.com\/beacon/g) || []).length, 1, f);
    if (f !== '404.html') assert.equal((s.match(/name="google-adsense-account"/g) || []).length, 1, f);
  }
});

test('印刷の着地ページ: noindex、sitemap に載せない。クレジットはそこへ向ける', () => {
  assert.match(read('print/index.html'), /<meta name="robots" content="noindex">/);
  assert.ok(!read('sitemap.xml').includes('/print/'));
  assert.ok(read('main.js').includes('yorozu-craft.com/furigana/print/'));
  for (const u of ['furigana/</loc>', 'furigana/guide.html</loc>', 'furigana/en/</loc>', 'furigana/en/guide.html</loc>']) assert.ok(read('sitemap.xml').includes(u), u);
});

test('使い方ページの精度の数字が日英でそろっている', () => {
  for (const n of ['96.9%', '826', '852', '81.9%', '484', '591', '41%']) {
    assert.ok(read('guide.html').includes(n), 'ja ' + n);
    assert.ok(read('en/guide.html').includes(n), 'en ' + n);
  }
});

test('Service Worker: キャッシュ名は furigana- で始まり、辞書はインストール時に取らない', () => {
  const s = read('sw.js');
  assert.match(s, /const CACHE_PREFIX = 'furigana-';/);
  assert.ok(!/PRECACHE_URLS = \[[^\]]*\.wasm/.test(s));
  // 辞書のキャッシュは画面のキャッシュと別。worker.js と sw.js で同じ名前（食い違うと、sw の掃除で辞書が消えて毎回 13MB を取り直す）
  assert.match(read('worker.js'), /const CACHE_NAME = 'furigana-dict-lindera-2\.0\.0';/);
  assert.match(s, /const DICT_CACHE\s+= `\$\{CACHE_PREFIX\}dict-lindera-2\.0\.0`;/);
  assert.match(s, /key !== CACHE_NAME && key !== DICT_CACHE/);
});

// 型 A（yorozu-plans D896・Q-1138）: 英語の使い方の <main> の最初の段落は答えの文。「▶ Open…」のリンクはその後ろ
test('英語の使い方: 最初の段落は答えの文、リンクはその後ろ', () => {
  const main = read('en/guide.html').split('<main')[1];
  const first = main.match(/<p[^>]*>([\s\S]*?)<\/p>/)[1];
  assert.equal(first, 'Paste Japanese text and the Furigana Generator adds readings above the kanji. You choose which kanji get furigana by Japanese school grade, then print the result or copy it as ruby HTML.');
  assert.ok(main.indexOf(first) < main.indexOf('▶ Open the Furigana Generator'));
});

test('Q-1232: 日本語トップの title・description・og は「習った漢字には振らない」を言い、外に送らない旨の断りを置かない', () => {
  const s = read('index.html');
  const T = 'ふりがなメーカー｜習った漢字には振らない学年別ルビ・A4印刷｜yorozu-craft';
  assert.ok(s.includes(`<title>${T}</title>`));
  assert.ok(s.includes(`<meta property="og:title" content="${T}">`));
  assert.ok(s.includes('<meta name="description" content="貼った文の漢字に、読む人の学年に合わせてふりがな（ルビ）を振ります。前の学年までに習った漢字だけの語には振りません。自信のない読みには印が付き、タップで直せます。A4 で印刷、Word 用にコピー。">'));
  assert.ok(s.includes('<meta property="og:description" content="貼った文に学年別のふりがな。自信のない読みに印、タップで直して A4 印刷。">'));
  const head = s.slice(0, s.indexOf('</head>'));
  assert.ok(!/外に送り|外に送らない/.test(head));
});

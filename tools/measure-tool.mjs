// 受け入れテスト #1（企画書 15 の 7 章）: ツールの実際の処理（calc.js の振る・振らない・印）で、青空文庫の人手ルビと突き合わせる
//
// 使い方: node tools/measure-tool.mjs [--no-extra] [--kuromoji=<kuromoji の dict フォルダ>] file1.utf8.html file2.utf8.html ...
//   --kuromoji: 比べるために kuromoji.js 0.1.2 で同じ規則を通す（npm i kuromoji@0.1.2 を別に入れる。リポジトリの依存には入れない）
//   青空文庫の XHTML を Shift_JIS → UTF-8 に変えて渡す（yorozu-plans の tools/demand/ruby/README.md と同じ手順）
//   iconv -f SHIFT_JIS -t UTF-8 -c 630_21624.html > 630_21624.utf8.html
//
// 数え方:
// - 人手ルビ 1 つ（親文字の範囲）ごとに、ツールが振ったルビ（送り仮名を外した漢字の並び＝seg）のうち範囲に重なるものを集める
// - 重なる seg がちょうど同じ範囲を覆えば、読みをつないで比べる（ひらがなにそろえる。旧仮名の差だけのものは measure.mjs と同じく別に数える）
// - 印つき（1 字の語・割れた複合語・読み分けあり）と印なしに分けて一致率を出す。合格基準は「印なしの一致率 ≥ 96.9%」（D33・企画書 7 章）
// - 振らなかったもの（未知語・固有名詞・送り仮名が合わない）と、範囲がずれて比べられないものは別に数える
// 抜き出し（本文・外字・注記・ルビ）は yorozu-plans の tools/demand/ruby/measure.mjs と同じ
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { analyse, useKuromoji } = require('../tests/helpers.js');

const args = process.argv.slice(2);
const noExtra = args.includes('--no-extra');
const kuroArg = args.find((a) => a.startsWith('--kuromoji='));
if (kuroArg) await useKuromoji(kuroArg.slice('--kuromoji='.length));
const files = args.filter((a) => !a.startsWith('--'));

const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = (s) => kata2hira(s).replace(/[\s　]/g, '').replace(/ヽ|ゝ/g, '');
const oldk = (t) => t.replace(/ゐ/g, 'い').replace(/ゑ/g, 'え').replace(/ぢ/g, 'じ').replace(/づ/g, 'ず').replace(/(?<=.)は/g, 'わ').replace(/(?<=.)ひ/g, 'い').replace(/(?<=.)ふ/g, 'う').replace(/(?<=.)へ/g, 'え').replace(/(?<=.)ほ/g, 'お').replace(/くわ/g, 'か').replace(/ぐわ/g, 'が').replace(/しやう|せう/g, 'しょう').replace(/ちやう|てう/g, 'ちょう').replace(/さう/g, 'そう').replace(/かう/g, 'こう').replace(/たう/g, 'とう').replace(/なう/g, 'のう').replace(/やう/g, 'よう').replace(/らう/g, 'ろう').replace(/わう/g, 'おう').replace(/あう/g, 'おう').replace(/えう/g, 'よう').replace(/きう/g, 'きゅう').replace(/しう/g, 'しゅう').replace(/ちう/g, 'ちゅう').replace(/りう/g, 'りゅう').replace(/にう/g, 'にゅう');

function extract(html) {
  const i = html.indexOf('class="main_text">'); const j = html.indexOf('<div class="bibliographical_information"');
  let body = i >= 0 ? html.slice(i + 18, j > i ? j : undefined) : html;
  body = body.replace(/<span class="notes">[\s\S]*?<\/span>/g, '');
  body = body.replace(/<img[^>]*alt="※([^"]*)"[^>]*>/g, '※');
  body = body.replace(/<br\s*\/?>/g, '\n');
  body = body.replace(/<ruby>(?:<rb>)?([^<]+?)(?:<\/rb>)?<rp>[^<]*<\/rp><rt>([^<]*)<\/rt><rp>[^<]*<\/rp><\/ruby>/g, (_, b, r) => `\u0001${b}\u0002${r}\u0003`);
  body = body.replace(/<[^>]+>/g, '');
  body = body.replace(/&[a-z]+;/g, ' ');
  let text = ''; const spans = [];
  const re = /\u0001([^\u0002]+)\u0002([^\u0003]*)\u0003/g; let last = 0, mm;
  while ((mm = re.exec(body)) !== null) {
    text += body.slice(last, mm.index);
    const start = text.length; text += mm[1];
    spans.push({ start, end: text.length, base: mm[1], rt: mm[2] });
    last = re.lastIndex;
  }
  text += body.slice(last);
  return { text, spans };
}

const total = { spans: 0, compared: 0, unmarked: { n: 0, ok: 0 }, marked: { n: 0, ok: 0 }, byMark: {}, oldkana: 0, notRubied: 0, unalignable: 0, oneKanjiOkurigana: { n: 0, ok: 0 } };
const samples = { unmarkedWrong: [], markedWrong: [] };
const rate = (o) => (o.n ? (100 * o.ok / o.n).toFixed(1) + '%' : '-');

for (const f of files) {
  const { text, spans } = extract(fs.readFileSync(f, 'utf8'));
  const units = analyse(text, { reader: 0, noExtra });
  // 振ったルビの seg を本文の位置つきで並べる
  const segs = [];
  for (const u of units) {
    if (!u.word || !u.ruby) continue;
    let p = u.start;
    for (const sg of u.segs) {
      if (sg.r != null) segs.push({ start: p, end: p + sg.b.length, r: sg.r, mark: u.mark, unit: u });
      p += sg.b.length;
    }
  }
  const file = { n: 0, ok: 0 };
  let k = 0;
  for (const sp of spans) {
    if (!sp.rt || /※/.test(sp.base)) continue;
    total.spans++;
    while (k < segs.length && segs[k].end <= sp.start) k++;
    const ov = [];
    for (let q = k; q < segs.length && segs[q].start < sp.end; q++) ov.push(segs[q]);
    if (!ov.length) { total.notRubied++; continue; }
    if (ov[0].start !== sp.start || ov[ov.length - 1].end !== sp.end) { total.unalignable++; continue; }
    const pred = ov.map((s) => s.r).join('');
    const gold = norm(sp.rt);
    const mark = ov.map((s) => s.mark).find(Boolean) || '';
    if (pred !== gold && (oldk(gold) === pred || oldk(gold) === oldk(pred))) { total.oldkana++; continue; }
    const ok = pred === gold;
    total.compared++;
    const bucket = mark ? total.marked : total.unmarked;
    bucket.n++; if (ok) bucket.ok++;
    total.byMark[mark || 'none'] ??= { n: 0, ok: 0 };
    total.byMark[mark || 'none'].n++; if (ok) total.byMark[mark || 'none'].ok++;
    if (!mark && ov.length === 1 && Array.from(sp.base).length === 1 && ov[0].unit.text.length > 1) {
      total.oneKanjiOkurigana.n++; if (ok) total.oneKanjiOkurigana.ok++;
    }
    file.n++; if (ok) file.ok++;
    if (!ok) {
      const arr = mark ? samples.markedWrong : samples.unmarkedWrong;
      if (arr.length < 40) arr.push(`${sp.base}: 正=${norm(sp.rt)} ツール=${pred}${mark ? ' [' + mark + ']' : ''}（${ov[0].unit.text}）`);
    }
  }
  console.log(`${f.replace(/^.*\//, '')}: 人手ルビ ${spans.filter((s) => s.rt).length}、比べた ${file.n}、一致 ${rate(file)}`);
}

console.log(`\n== ${kuroArg ? 'kuromoji.js 0.1.2' : 'lindera-wasm 2.0.0'}・${noExtra ? '追加辞書なし' : '追加辞書あり'}（読む人 = すべての漢字）`);
console.log(`人手ルビ ${total.spans}: 比べた ${total.compared}、旧仮名の差だけ ${total.oldkana}、ツールが振らなかった ${total.notRubied}、範囲がずれて比べられない ${total.unalignable}`);
console.log(`印なし: ${total.unmarked.ok} / ${total.unmarked.n} = ${rate(total.unmarked)}  ← 合格基準 96.9% 以上`);
console.log(`印つき: ${total.marked.ok} / ${total.marked.n} = ${rate(total.marked)}（比べた中の印つきの割合 ${(100 * total.marked.n / Math.max(1, total.compared)).toFixed(1)}%）`);
console.log('印の種類ごと: ' + Object.entries(total.byMark).map(([k, v]) => `${k} ${v.ok}/${v.n}=${rate(v)}`).join('、'));
console.log(`（参考）印なしのうち、送り仮名つきで漢字 1 字の語: ${total.oneKanjiOkurigana.ok}/${total.oneKanjiOkurigana.n} = ${rate(total.oneKanjiOkurigana)}`);
console.log('\n== 印なしで違った例'); console.log(samples.unmarkedWrong.join('\n'));
console.log('\n== 印つきで違った例'); console.log(samples.markedWrong.slice(0, 20).join('\n'));

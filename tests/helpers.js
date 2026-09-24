// テスト・計測で共通に使う: Node 版の lindera（devDependencies の lindera-wasm-nodejs-ipadic）で本文を解析し、calc.js の規則を通す
// ブラウザ版（dict/ の lindera-wasm-web-ipadic）と同じ版・同じ IPADIC
const fs = require('node:fs');
const path = require('node:path');
const Calc = require('../calc.js');
const CONSTANTS = require('../constants.js');

let tokenizer = null;
function getTokenizer() {
  if (!tokenizer) {
    const L = require('lindera-wasm-nodejs-ipadic');
    const b = new L.TokenizerBuilder();
    b.setDictionary('embedded://ipadic');
    b.setMode('normal');
    tokenizer = b.build();
  }
  return tokenizer;
}
// worker.js と同じ形のトークン（行ごとに解析）
function rawTokens(text) {
  const out = [];
  for (const line of String(text).split(/(?<=\n)/)) {
    if (!line.trim()) continue;
    for (const t of getTokenizer().tokenize(line)) {
      out.push({ surface: t.surface, reading: t.reading, partOfSpeech: t.partOfSpeech, partOfSpeechSubcategory1: t.partOfSpeechSubcategory1 });
    }
  }
  return out;
}
const levels = Calc.buildLevels(CONSTANTS);
const extraFile = path.join(__dirname, '..', 'data', 'extra-dict.json');
const extra = fs.existsSync(extraFile) ? JSON.parse(fs.readFileSync(extraFile, 'utf8')).entries : {};

// 比較用: kuromoji.js 0.1.2（企画書の D68。npm i kuromoji@0.1.2 を別に入れたときだけ）。useKuromoji(dir) で切り替える
let kuro = null;
async function useKuromoji(dicPath) {
  const kuromoji = require('kuromoji');
  kuro = await new Promise((res, rej) => kuromoji.builder({ dicPath }).build((e, t) => (e ? rej(e) : res(t))));
}
function rawTokensKuromoji(text) {
  const out = [];
  for (const line of String(text).split(/(?<=\n)/)) {
    if (!line.trim()) continue;
    for (const t of kuro.tokenize(line)) {
      out.push({ surface: t.surface_form, reading: t.reading, partOfSpeech: t.word_type === 'UNKNOWN' ? 'UNK' : t.pos, partOfSpeechSubcategory1: t.pos_detail_1 });
    }
  }
  return out;
}

function analyse(text, opts = {}) {
  const toks = Calc.alignTokens(text, kuro ? rawTokensKuromoji(text) : rawTokens(text));
  return Calc.annotate(text, toks, { reader: opts.reader ?? 0 }, {
    levels,
    user: opts.user || {},
    extra: opts.noExtra ? {} : (opts.extra || extra),
    amb: opts.noAmb ? {} : CONSTANTS.ambiguousReadings.value,
  });
}
// 語の単位を引く（表層形で）
function unitOf(units, text) { return units.find((u) => u.word && u.text === text); }

module.exports = { Calc, CONSTANTS, rawTokens, analyse, unitOf, levels, extra, useKuromoji };

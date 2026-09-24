// ===========================
// ふりがなメーカー — ルビの決め方と出力（画面から切り離した純粋関数）
// DOM や localStorage に触らない。tests/*.test.js から node --test で確かめる
// ブラウザでは window.Calc、Node（テスト・計測）では module.exports で使う
//
// 流れ: 解析器のトークン（worker.js）→ alignTokens（本文の位置に合わせる）→ annotate（振る・振らない・印）→ 各形式の出力
// ===========================
(function (root) {
  'use strict';

  // --- 文字の種類 ---
  // 漢字として扱う字: CJK 統合漢字（拡張 A・B 以降を含む）・互換漢字・々（くり返し）・〆・ヶ・ヵ（霞ヶ関・3ヶ月）
  function isKanjiCode(c) {
    return (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) || (c >= 0xF900 && c <= 0xFAFF) ||
      (c >= 0x20000 && c <= 0x3134F) || c === 0x3005 || c === 0x3006 || c === 0x30F6 || c === 0x30F5;
  }
  function isKanjiChar(ch) { return isKanjiCode(ch.codePointAt(0)); }
  // 学年の判定に使う「本当の漢字」（々・〆・ヶ・ヵ は数えない）
  function isRealKanji(ch) { var c = ch.codePointAt(0); return isKanjiCode(c) && c !== 0x3005 && c !== 0x3006 && c !== 0x30F6 && c !== 0x30F5; }
  function hasKanji(s) { return Array.from(s).some(isKanjiChar); }
  function allKanji(s) { return s.length > 0 && Array.from(s).every(isKanjiChar); }
  function kataToHira(s) {
    return String(s).replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }
  // 読みとして使える文字（ひらがな・カタカナ・長音）
  var KANA_RE = /^[ぁ-ゖゝゞァ-ヺーヽヾ]+$/;
  function isKana(s) { return KANA_RE.test(s); }
  var DIGIT_RE = /[0-9０-９]/;

  // --- 学年（決定 D69） ---
  // 字の段階: 1〜6 = 配当表の学年、7 = 常用漢字（配当表の外。中学で習う）、8 = 常用漢字表にない字
  function buildLevels(constants) {
    var m = Object.create(null);
    Array.from(constants.joyoKanji.value).forEach(function (ch) { m[ch] = 7; });
    var same = constants.joyoKanji.sameAs || {};
    Object.keys(same).forEach(function (k) { m[k] = 7; });
    var g = constants.kanjiByGrade.value;
    Object.keys(g).forEach(function (n) { Array.from(g[n]).forEach(function (ch) { m[ch] = Number(n); }); });
    return m;
  }
  function kanjiLevel(levels, ch) { return levels[ch] || 8; }
  // 語の中でいちばん上の段階（漢字が無ければ 0。々・ヶ だけなら 1）
  function wordLevel(levels, s) {
    var max = 0;
    Array.from(s).forEach(function (ch) {
      if (isRealKanji(ch)) max = Math.max(max, kanjiLevel(levels, ch));
      else if (isKanjiChar(ch)) max = Math.max(max, 1);
    });
    return max;
  }
  // 読む人: 0 = すべて、1〜6 = N 年生、7 = 中学生、8 = 大人（常用漢字表にない字だけ）
  // N 年生には N 年生の字から上を振る（N−1 年までに習った字は振らない）。語の中に 1 字でも振る字があれば語ごと振る
  function needsRuby(level, reader) {
    if (level <= 0) return false;
    return level >= Math.max(1, Number(reader) || 0);
  }

  // --- 解析器のトークンを本文の位置に合わせる ---
  // raw: lindera の出力（surface・reading・partOfSpeech・partOfSpeechSubcategory1）。空白・改行は解析器が捨てることがあるので、
  // 表層形を本文の中で順に探して位置を決める（見つからないトークンは捨て、その部分は地の文のまま出す）
  function alignTokens(text, raw) {
    var out = [], pos = 0;
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i], s = t.surface;
      if (!s) continue;
      var at = text.indexOf(s, pos);
      if (at < 0) continue;
      var r = t.reading && t.reading !== '*' ? kataToHira(t.reading) : '';
      out.push({ s: s, r: r, pos: t.partOfSpeech || '', pos1: t.partOfSpeechSubcategory1 || '', start: at, end: at + s.length });
      pos = at + s.length;
    }
    return out;
  }

  // --- 読みを表層形に割り付ける（送り仮名の外に出す）---
  // 例: 取り扱い / とりあつかい → [取:と] り [扱:あつか] い。漢字の並び 1 つずつに読みを付ける。合わなければ null
  function splitRuns(surface) {
    var runs = [];
    Array.from(surface).forEach(function (ch) {
      var k = isKanjiChar(ch);
      var last = runs[runs.length - 1];
      if (last && last.k === k) last.t += ch; else runs.push({ t: ch, k: k });
    });
    return runs;
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function alignReading(surface, reading) {
    var r = kataToHira(reading);
    if (!r || !isKana(r)) return null;
    var runs = splitRuns(surface);
    if (!runs.some(function (x) { return x.k; })) return null;
    var pat = '^' + runs.map(function (x) { return x.k ? '(.+?)' : '(' + escRe(kataToHira(x.t)) + ')'; }).join('') + '$';
    var m;
    try { m = new RegExp(pat).exec(r); } catch (e) { return null; }
    if (!m) return null;
    return runs.map(function (x, i) { return x.k ? { b: x.t, r: m[i + 1] } : { b: x.t }; });
  }

  // --- 日付の「N日」（算用数字の後の 日）---
  // 2〜10・14・20・24 日は数字ごと読む（ふつか・とおか…）。1 日は ついたち／いちにち で割れるので「読み分けあり」。ほかは「にち」
  var DAY_READINGS = { 1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか', 14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか' };
  function toHalfDigits(s) { return s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); }

  // --- 追加辞書・端末の辞書の引き当て ---
  // トークンの切れ目から始まり切れ目で終わる、いちばん長い見出しを探す（語の途中には当てない: 市場 の 市 には当てない）
  var MAX_JOIN = 8;
  var own = Object.prototype.hasOwnProperty;
  function matchAt(text, toks, i, dicts) {
    var best = null;
    for (var j = i; j < toks.length && j < i + MAX_JOIN; j++) {
      if (j > i && toks[j].start !== toks[j - 1].end) break;   // 間に空白などがあれば続けない
      var s = text.slice(toks[i].start, toks[j].end);
      if (dicts.user && own.call(dicts.user, s)) best = { j: j, s: s, src: 'user', r: dicts.user[s] };
      else if (dicts.extra && own.call(dicts.extra, s)) best = { j: j, s: s, src: 'extra', r: dicts.extra[s][0], flag: dicts.extra[s][1] || '' };
    }
    return best && hasKanji(best.s) ? best : null;
  }

  // --- 送り仮名の重なり（俄か → 俄 + か）---
  // IPADIC には送り仮名を含まない見出し（俄 = にわか、身近 = みぢか）や、古い送り仮名（短かい・悪るい・或る・疑ぐる）に当たる語がある。
  // 解析器はそのとき「漢字だけのトークン（読みは語全体）」と「後ろの仮名」に分けるので、読みの終わりが本文の続きの仮名と重なる。
  // 重なった分を読みから外し、ルビは漢字の分だけにする（俄 → にわ）。
  // 名詞（中から・今まで・お金ね）では重なりがふつうに起きるので、形容動詞の語幹・形容詞・動詞・連体詞だけに限る
  function trimOverlap(text, t) {
    if (!(t.pos1 === '形容動詞語幹' || t.pos === '形容詞' || t.pos === '動詞' || t.pos === '連体詞')) return t.r;
    var chars = Array.from(t.s);
    if (!isKanjiChar(chars[chars.length - 1])) return t.r;
    for (var k = Math.min(3, t.r.length - 1); k >= 1; k--) {
      var next = text.substr(t.end, k);
      if (/^[ぁ-ゖ]+$/.test(next) && t.r.slice(-k) === next) return t.r.slice(0, -k);
    }
    return t.r;
  }

  function okToken(t) {
    return !!t.r && isKana(t.r) && t.pos1 !== '固有名詞' && t.pos !== 'UNK';
  }

  /**
   * 本文にルビを付ける単位（語）を決める
   * @param {string} text 本文
   * @param {Array} toks alignTokens の結果
   * @param {{reader:number}} opts 読む人（needsRuby を見る）
   * @param {{user?:Object, extra?:Object, amb?:Object, levels:Object}} dicts user: 端末の辞書 {表記: 読み（'' は振らない）}、extra: 追加辞書 {表記: [読み, 'p'|'a'|'']}、amb: 読み分けのある語 {表記: [読み, …]}
   * @returns {Array} 単位の配列。{start, end, text, word, segs:[{b, r?}], reading, ruby, mark:''|'one'|'split'|'amb'|'okuri', alts?:[読み], skip:''|'unknown'|'proper'|'user'|'align', src, level}
   */
  function annotate(text, toks, opts, dicts) {
    var reader = opts && opts.reader != null ? opts.reader : 0;
    var levels = dicts.levels;
    var units = [];
    var pos = 0;
    function plain(start, end) { if (end > start) units.push({ start: start, end: end, text: text.slice(start, end), word: false }); }
    function word(start, end, u) {
      u.start = start; u.end = end; u.text = text.slice(start, end); u.word = true;
      u.level = wordLevel(levels, u.text);
      u.ruby = !u.skip && !!u.segs && needsRuby(u.level, reader);
      units.push(u);
    }
    // 直前の地の文から [from, 今) を切り取る（数字を語に含めるとき）。語の単位にかかるなら false
    function takeBack(from) {
      for (var k = units.length - 1; k >= 0 && units[k].end > from; k--) if (units[k].word) return false;
      while (units.length && units[units.length - 1].end > from) {
        var last = units[units.length - 1];
        if (last.start >= from) units.pop();
        else { last.end = from; last.text = text.slice(last.start, from); break; }
      }
      return true;
    }
    // 読み分けのある語（tools/ambiguous-verified.tsv。どちらの読みも辞書にある語）: 読みは変えず印を付け、ほかの読みを持たせる（直す画面に出す）
    function ambMark(u, s) {
      if (dicts.amb && own.call(dicts.amb, s)) { u.mark = 'amb'; u.alts = dicts.amb[s].slice(); }
    }
    var i = 0;
    while (i < toks.length) {
      var t = toks[i];
      plain(pos, t.start);
      pos = t.start;
      var surfaceHasKanji = hasKanji(t.s);
      var m = matchAt(text, toks, i, dicts);
      if (m) {
        var end = toks[m.j].end;
        if (m.src === 'user') {
          if (!m.r) word(pos, end, { skip: 'user', src: 'user', mark: '' });
          else word(pos, end, { segs: alignReading(m.s, m.r) || [{ b: m.s, r: kataToHira(m.r) }], reading: kataToHira(m.r), src: 'user', mark: '', skip: '' });
        } else {
          var segs = alignReading(m.s, m.r);
          var eu = segs ? { segs: segs, reading: m.r, src: m.flag === 'p' ? 'place' : 'extra', mark: m.flag === 'a' ? 'amb' : '', skip: '' }
            : { skip: 'align', src: 'extra', mark: '' };
          if (segs && m.flag !== 'p') ambMark(eu, m.s);
          word(pos, end, eu);
        }
        pos = end; i = m.j + 1; continue;
      }
      if (!surfaceHasKanji) { plain(pos, t.end); pos = t.end; i++; continue; }

      // 算用数字 + 日（日付）・算用数字 + 月（4月 → がつ。解析器は つき と読むことがある）
      var prev = t.start > 0 ? text.charAt(t.start - 1) : '';
      if ((t.s === '日' || t.s === '月') && DIGIT_RE.test(prev)) {
        var ds = t.start;
        while (ds > 0 && DIGIT_RE.test(text.charAt(ds - 1))) ds--;
        var n = Number(toHalfDigits(text.slice(ds, t.start)));
        if (t.s === '月') {
          word(pos, t.end, { segs: [{ b: '月', r: 'がつ' }], reading: 'がつ', src: 'rule', mark: 'one', skip: '' });
        } else if (DAY_READINGS[n] && takeBack(ds)) {
          word(ds, t.end, { segs: [{ b: text.slice(ds, t.end), r: DAY_READINGS[n] }], reading: DAY_READINGS[n], src: 'rule', mark: n === 1 ? 'amb' : 'one', skip: '' });
        } else {
          word(pos, t.end, { segs: [{ b: '日', r: 'にち' }], reading: 'にち', src: 'rule', mark: 'one', skip: '' });
        }
        pos = t.end; i++; continue;
      }

      // 割れた複合語: 漢字だけのトークンが 2 つ以上続く（三毛猫 → 三/毛/猫）→ 1 語にまとめて印
      if (allKanji(t.s) && okToken(t)) {
        var j = i;
        while (j + 1 < toks.length && toks[j + 1].start === toks[j].end && allKanji(toks[j + 1].s) && okToken(toks[j + 1]) &&
          !matchAt(text, toks, j + 1, dicts)) j++;
        if (j > i) {
          var rd = toks.slice(i, j + 1).map(function (x) { return x.r; }).join('');
          var su = { segs: [{ b: text.slice(t.start, toks[j].end), r: rd }], reading: rd, src: 'analyzer', mark: 'split', skip: '' };
          ambMark(su, text.slice(t.start, toks[j].end));
          word(pos, toks[j].end, su);
          pos = toks[j].end; i = j + 1; continue;
        }
      }

      // 1 トークン
      var u = { src: 'analyzer', mark: '', skip: '', pos: t.pos };
      if (!t.r || !isKana(t.r) || t.pos === 'UNK') u.skip = 'unknown';
      else if (t.pos1 === '固有名詞') u.skip = 'proper';
      else {
        var tr = trimOverlap(text, t);
        u.segs = alignReading(t.s, tr);
        if (!u.segs) u.skip = 'align';
        else {
          u.reading = tr;
          if (Array.from(t.s).length === 1) u.mark = 'one';   // 1 字だけの漢字の語（額・方・外）
          else if (tr !== t.r) u.mark = 'okuri';               // 送り仮名の重なりを外した語（身近か）。外し方が推測なので印
          ambMark(u, t.s);
        }
      }
      word(pos, t.end, u);
      pos = t.end; i++;
    }
    plain(pos, text.length);
    // 漢字どうしが語の切れ目で接している（無暗に → 無 / 暗に、立停まった）: 1 つの語が割れたかもしれないので、
    // 両側とも印を付ける（割れた複合語と同じ扱い）。両側とも解析器の語のときだけ（追加辞書・端末の辞書の語は語の切れ目が確かなので、
    // 一日中|歩いた は数えない）。振らない語（人名など）の隣も数えない
    for (var q = 0; q + 1 < units.length; q++) {
      var a = units[q], b = units[q + 1];
      if (!a.word || !b.word || a.end !== b.start || a.skip || b.skip || a.src !== 'analyzer' || b.src !== 'analyzer') continue;
      var ac = Array.from(a.text), bc = Array.from(b.text);
      if (!isKanjiChar(ac[ac.length - 1]) || !isKanjiChar(bc[0])) continue;
      if (!a.mark) a.mark = 'split';
      if (!b.mark) b.mark = 'split';
    }
    return units;
  }

  // 数える（画面の 1 行と計測に使う）
  function summarize(units) {
    var s = { words: 0, ruby: 0, marked: 0, skipped: 0 };
    units.forEach(function (u) {
      if (!u.word) return;
      s.words++;
      if (u.skip) s.skipped++;
      if (u.ruby) { s.ruby++; if (u.mark) s.marked++; }
    });
    return s;
  }

  // --- ローマ字（ヘボン式。長音は ā ū ō。決定 D74）---
  var ROMA = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho', 'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo', 'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo', 'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
    'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo', 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo', 'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'しぇ': 'she', 'ちぇ': 'che', 'じぇ': 'je', 'てぃ': 'ti', 'でぃ': 'di', 'とぅ': 'tu', 'どぅ': 'du', 'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
    'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo',
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o', 'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so', 'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no', 'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo', 'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro', 'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go', 'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do', 'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po', 'ゔ': 'vu',
    'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa',
  };
  var MACRON = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
  /**
   * ひらがな → ヘボン式ローマ字（1 語ずつ）
   * - ん は母音・や行の前で n'（きんえん → kin'en）
   * - っ は次の子音を重ねる（ch の前は t: まっちゃ → matcha）
   * - 長音: おう・おお → ō、うう → ū、ああ → ā、ー は前の母音を伸ばす。えい・いい はそのまま（ei・ii）
   * - keepFinalU: 動詞の終わりの う は伸ばさない（思う → omou）
   */
  function toRomaji(hira, keepFinalU) {
    var s = kataToHira(hira);
    var out = '';
    var i = 0;
    var sokuon = false;
    while (i < s.length) {
      var two = s.substr(i, 2), one = s.charAt(i), syl;
      if (two.length === 2 && ROMA[two] && /[ゃゅょぁぃぅぇぉ]/.test(two.charAt(1))) { syl = ROMA[two]; i += 2; }
      else if (one === 'っ') { sokuon = true; i++; continue; }
      else if (one === 'ん') { syl = /[あいうえおやゆよ]/.test(s.charAt(i + 1)) ? "n'" : 'n'; i++; }
      else if (one === 'ー') {
        var lv = out.charAt(out.length - 1);
        if (MACRON[lv]) out = out.slice(0, -1) + MACRON[lv];
        i++; continue;
      } else if (ROMA[one]) { syl = ROMA[one]; i++; }
      else { syl = one; i++; }
      if (sokuon) { syl = (syl.indexOf('ch') === 0 ? 't' : syl.charAt(0)) + syl; sokuon = false; }
      var prevV = out.charAt(out.length - 1);
      var isLast = i >= s.length;
      if ((syl === 'u' && (prevV === 'o' || prevV === 'u') && !(keepFinalU && isLast)) ||
          (syl === 'o' && prevV === 'o') || (syl === 'a' && prevV === 'a')) {
        out = out.slice(0, -1) + MACRON[prevV];
        continue;
      }
      out += syl;
    }
    if (sokuon) out += "'";
    return out;
  }

  // --- 出力（HTML の <ruby>・青空文庫形式・括弧・ひらがなだけ・印刷）---
  // pieces: 地の文 {t} と ルビ {b, r, mark} の並び。画面・印刷・コピーはすべてここから作る
  function toPieces(units, script) {
    var out = [];
    function pushText(t) {
      if (!t) return;
      var last = out[out.length - 1];
      if (last && last.t != null) last.t += t; else out.push({ t: t });
    }
    units.forEach(function (u) {
      if (!u.ruby) { pushText(u.text); return; }
      u.segs.forEach(function (sg) {
        if (sg.r == null) pushText(sg.b);
        else out.push({ b: sg.b, r: script === 'romaji' ? toRomaji(sg.r, u.src === 'analyzer' && /動詞/.test(u.pos || '')) : sg.r, mark: u.mark || '' });
      });
    });
    return out;
  }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toHtml(pieces) {
    return pieces.map(function (p) {
      if (p.t != null) return escHtml(p.t).replace(/\r?\n/g, '<br>\n');
      return '<ruby>' + escHtml(p.b) + '<rp>(</rp><rt>' + escHtml(p.r) + '</rt><rp>)</rp></ruby>';
    }).join('');
  }
  function toAozora(pieces) {
    return pieces.map(function (p) {
      if (p.t != null) return p.t.replace(/[｜《》]/g, function (c) { return '※' + c; });
      return '｜' + p.b + '《' + p.r + '》';
    }).join('');
  }
  function toBrackets(pieces) {
    return pieces.map(function (p) { return p.t != null ? p.t : p.b + '（' + p.r + '）'; }).join('');
  }
  function toHiraganaOnly(pieces) {
    return pieces.map(function (p) { return p.t != null ? p.t : p.r; }).join('');
  }

  // 読み戻し（往復のテスト用。自分の出力を読む前提で、一般の HTML は読まない）
  function mergeText(arr) {
    var out = [];
    arr.forEach(function (p) {
      if (p.t != null) { if (!p.t) return; var l = out[out.length - 1]; if (l && l.t != null) l.t += p.t; else out.push({ t: p.t }); }
      else out.push({ b: p.b, r: p.r });
    });
    return out;
  }
  function parseAozora(s) {
    var out = [], re = /※([｜《》])|｜([^｜《》\n]+)《([^《》\n]*)》/g, last = 0, m;
    while ((m = re.exec(s))) {
      out.push({ t: s.slice(last, m.index) });
      if (m[1]) out.push({ t: m[1] }); else out.push({ b: m[2], r: m[3] });
      last = re.lastIndex;
    }
    out.push({ t: s.slice(last) });
    return mergeText(out);
  }
  // 括弧形式は「（」の直前の漢字の並びを親文字とみなす（漢字が続いて片方だけ振ったときは戻せない。使い方ページに書く）
  function parseBrackets(s) {
    var out = [], re = /（([ぁ-ゖー]+)）/g, last = 0, m;
    while ((m = re.exec(s))) {
      var chars = Array.from(s.slice(last, m.index)), k = chars.length;
      while (k > 0 && isKanjiChar(chars[k - 1])) k--;
      if (k === chars.length) { out.push({ t: s.slice(last, re.lastIndex) }); last = re.lastIndex; continue; }
      out.push({ t: chars.slice(0, k).join('') });
      out.push({ b: chars.slice(k).join(''), r: m[1] });
      last = re.lastIndex;
    }
    out.push({ t: s.slice(last) });
    return mergeText(out);
  }
  function unescHtml(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
  function parseHtmlRuby(html) {
    var out = [], re = /<ruby>([^<]*)(?:<rp>[^<]*<\/rp>)?<rt>([^<]*)<\/rt>(?:<rp>[^<]*<\/rp>)?<\/ruby>/g, last = 0, m;
    function txt(h) { return unescHtml(h.replace(/<br>\n?/g, '\n')); }
    while ((m = re.exec(html))) {
      out.push({ t: txt(html.slice(last, m.index)) });
      out.push({ b: unescHtml(m[1]), r: unescHtml(m[2]) });
      last = re.lastIndex;
    }
    out.push({ t: txt(html.slice(last)) });
    return mergeText(out);
  }

  // --- 端末の辞書（タップで直した読み。localStorage furigana_dict）---
  var DICT_MAX = 3000;
  function normalizeUserDict(d) {
    var out = {};
    if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
    var n = 0;
    Object.keys(d).forEach(function (k) {
      if (n >= DICT_MAX) return;
      var v = d[k];
      if (k.length > 30 || !hasKanji(k) || /[\s<>]/.test(k)) return;
      if (typeof v !== 'string' || v.length > 60) return;
      v = kataToHira(v.trim());
      if (v && !isKana(v)) return;
      out[k] = v; n++;
    });
    return out;
  }
  // 入力された読みを確かめる（画面の修正ダイアログ）。ひらがな・カタカナ以外が入っていれば null
  function cleanReading(s) {
    var v = kataToHira(String(s || '').replace(/[\s　]/g, ''));
    return v && isKana(v) ? v : null;
  }

  // --- 設定 ---
  var READERS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  function normalizeSettings(s) {
    s = s && typeof s === 'object' ? s : {};
    return {
      reader: READERS.indexOf(Number(s.reader)) >= 0 ? Number(s.reader) : 0,
      showMarks: s.showMarks !== false,
      printMarks: s.printMarks === true,
      size: ['m', 'l', 'xl'].indexOf(s.size) >= 0 ? s.size : 'm',
      vertical: s.vertical === true,
      script: s.script === 'romaji' ? 'romaji' : 'hiragana',
      credit: s.credit !== false,
      format: ['html', 'aozora', 'brackets', 'hiragana'].indexOf(s.format) >= 0 ? s.format : 'html',
    };
  }

  // --- 入力の上限 ---
  var MAX_CHARS = 10000;
  function clampInput(text) {
    var s = String(text || '');
    return s.length > MAX_CHARS ? { text: s.slice(0, MAX_CHARS), cut: s.length - MAX_CHARS } : { text: s, cut: 0 };
  }

  // --- ブックマークレット（決定 D73。PC だけ）---
  // 開いているページの選んだ文字（無ければ本文）を取り、このツールを新しいタブで開く。
  // 短ければ # 以降に入れ、長ければ開いた先から「準備できた」を受けて postMessage で渡す（どちらもサーバーには届かない）。
  // 相手のページには何も書き込まない。
  var HASH_LIMIT = 6000;   // encodeURIComponent 後の長さ。これを超えたら postMessage
  function makeBookmarklet(toolUrl) {
    var origin = toolUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1');
    var src = '(function(){' +
      'var s=String(window.getSelection?getSelection():"").trim();' +
      'if(!s){var m=document.querySelector("article,main,[role=main]");s=((m||document.body).innerText||"").trim();}' +
      's=s.slice(0,' + MAX_CHARS + ');' +
      'var e=encodeURIComponent(s),u=' + JSON.stringify(toolUrl) + ';' +
      'if(e.length<=' + HASH_LIMIT + '){window.open(u+"#t="+e,"_blank");return;}' +
      'var w=window.open(u+"#pm","_blank");if(!w)return;' +
      'var f=function(ev){if(ev.origin!==' + JSON.stringify(origin) + '||ev.source!==w||!ev.data||ev.data.type!=="furigana-ready")return;' +
      'window.removeEventListener("message",f);w.postMessage({type:"furigana-text",text:s},' + JSON.stringify(origin) + ');};' +
      'window.addEventListener("message",f);' +
      '})();';
    return 'javascript:' + encodeURIComponent(src);
  }
  // 開いた側: #t=… の本文を取り出す（壊れていれば null）
  function readHashText(hash) {
    var m = /^#t=(.*)$/.exec(hash || '');
    if (!m) return null;
    try { return clampInput(decodeURIComponent(m[1])).text; } catch (e) { return null; }
  }

  // --- バックアップファイル（README「ツールを追加するとき」20。決定 D31） ---
  // 形式: { tool, version, exportedAt, data }。data はブラウザに保存しているものと同じ形
  var BACKUP_VERSION = 1;
  function backupFileName(tool, date) {
    var d = date || new Date();
    return tool + '-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  }
  function buildBackup(tool, data, date) {
    return { tool: tool, version: BACKUP_VERSION, exportedAt: (date || new Date()).toISOString(), data: data };
  }
  var BACKUP_MSG_JA = {
    unreadable: 'ファイルを読み取れませんでした。このツールの「ファイルに書き出す」で作った .json ファイルを選んでください。',
    other: function (t) { return 'ほかのツール（' + t + '）のファイルです。このツールで書き出したファイルを選んでください。'; },
    newer: '新しい版のツールで書き出したファイルのため読み込めません。ページを再読み込みしてから、もう一度お試しください。',
    format: 'ファイルの形式が正しくないため読み込めません。',
    missing: 'ファイルの中身が足りないため読み込めません。',
  };
  /**
   * 読み込んだファイルの文字列を確かめる。中身の正規化は normalizeUserDict / normalizeSettings で行う
   * @param {Object} [msg] 画面に出す文（英語ページ用に差し替える。形は BACKUP_MSG_JA と同じ）
   * @returns {{ok: true, data: object} | {ok: false, error: string}}
   */
  function parseBackup(text, tool, requiredKeys, msg) {
    msg = msg || BACKUP_MSG_JA;
    var o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.tool !== 'string') return { ok: false, error: msg.unreadable };
    if (o.tool !== tool) return { ok: false, error: msg.other(o.tool.slice(0, 40)) };
    if (o.version !== BACKUP_VERSION) {
      return { ok: false, error: typeof o.version === 'number' && o.version > BACKUP_VERSION ? msg.newer : msg.format };
    }
    var data = o.data;
    var missing = !data || typeof data !== 'object' || Array.isArray(data) ||
      (requiredKeys || []).some(function (k) { return data[k] === undefined || data[k] === null; });
    if (missing) return { ok: false, error: msg.missing };
    return { ok: true, data: data };
  }

  var api = {
    isKanjiChar: isKanjiChar, hasKanji: hasKanji, kataToHira: kataToHira,
    buildLevels: buildLevels, wordLevel: wordLevel, needsRuby: needsRuby,
    alignTokens: alignTokens, alignReading: alignReading, annotate: annotate, summarize: summarize,
    toRomaji: toRomaji, toPieces: toPieces, toHtml: toHtml, toAozora: toAozora, toBrackets: toBrackets, toHiraganaOnly: toHiraganaOnly,
    parseAozora: parseAozora, parseBrackets: parseBrackets, parseHtmlRuby: parseHtmlRuby, escHtml: escHtml,
    normalizeUserDict: normalizeUserDict, cleanReading: cleanReading, normalizeSettings: normalizeSettings,
    MAX_CHARS: MAX_CHARS, clampInput: clampInput, HASH_LIMIT: HASH_LIMIT, makeBookmarklet: makeBookmarklet, readHashText: readHashText,
    backupFileName: backupFileName, buildBackup: buildBackup, parseBackup: parseBackup,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);

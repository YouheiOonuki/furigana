// ===========================
// ふりがなメーカー — 画面の制御（日本語 / と英語 /en/ で共通。文言は TEXT に日英で持ち、<html lang> で選ぶ）
// 規則と出力は calc.js（純粋関数）、字の一覧・辞書の版は constants.js、解析は worker.js（Web Worker）
// ===========================
(function () {
  'use strict';

  var Calc = window.Calc, C = window.Constants;
  var LANG = document.documentElement.lang === 'en' ? 'en' : 'ja';
  // main.js の置き場所を基準にする（/furigana/ と /furigana/en/ の両方から同じファイルを読むため）
  var BASE = new URL('.', document.currentScript.src).href;
  var TOOL = 'furigana';

  var TEXT = {
    ja: {
      idle: '文を貼ると、辞書（約 13MB、初回だけ）を読み込んで解析します。',
      loading: function (p, mb) { return '辞書を読み込み中… ' + p + '%（' + mb + ' / 13MB。初回だけ。本文は送りません）'; },
      preparing: '辞書を準備しています…',
      analysing: '解析しています…',
      loadFailed: '辞書を読み込めませんでした。通信を確かめて、文を貼り直してください。',
      noWorker: 'このブラウザでは解析できません（Web Worker のモジュールに未対応）。新しいブラウザでお試しください。',
      summary: function (s) { return '振った語 ' + s.ruby + '（うち点線 ' + s.marked + '）・振らなかった語（人名・知らない語など）' + s.skipped + '。'; },
      overLimit: function (n) { return '10,000 字を超えた分（' + n.toLocaleString('ja-JP') + ' 字）は使いません。'; },
      empty: 'ここに、ふりがなを振った文が出ます。',
      readerHint: {
        0: 'すべての漢字に振ります。',
        2: '1年生で習う字だけの語には振りません。', 3: '2年生までに習う字だけの語には振りません。',
        4: '3年生までに習う字だけの語には振りません。', 5: '4年生までに習う字だけの語には振りません。',
        6: '5年生までに習う字だけの語には振りません。', 7: '小学校で習う字だけの語には振りません。',
        8: '常用漢字表にない字を含む語だけに振ります。',
      },
      markTitle: { one: '1 字の語（読みが文脈で変わることがある）', split: '辞書で分かれた語（読みを確かめてください）', amb: '読みが 2 つ以上ある語' },
      fixNote: function (u) {
        if (u.skip === 'proper') return '人名・地名などは振っていません。読みを入れると振ります。';
        if (u.skip === 'unknown' || u.skip === 'align') return '辞書に無い語なので振っていません。読みを入れると振ります。';
        if (u.skip === 'user') return '「振らない」にしてあります。';
        if (u.src === 'user') return '直した読みです。';
        if (u.mark === 'amb') return '読みが 2 つ以上ある語です。';
        if (u.mark) return '自信のない読みです。';
        return '';
      },
      badReading: 'ひらがな（またはカタカナ）で入れてください。',
      copied: 'コピーしました。',
      copyFailed: 'コピーできませんでした。「出力の形式・くわしい設定」の欄から選んでコピーしてください。',
      nothing: '先に文を貼ってください。',
      dictEmpty: 'まだありません。見本の語をタップして直すと、ここに入ります。',
      skipLabel: '（振らない）',
      del: '消す',
      credit: 'yorozu-craft.com/furigana/print/ で作成',
      exported: 'ファイルに書き出しました。機種変更のときは、このファイルを新しい端末に移して「ファイルから読み込む」を押してください。',
      tooBig: 'ファイルが大きすぎます。このツールで書き出したファイルを選んでください。',
      confirmImport: 'ファイルの内容で、今の本文・設定・直した読みを置き換えます。よろしいですか？',
      imported: 'ファイルから読み込みました。',
      unreadable: 'ファイルを読み取れませんでした。',
      confirmClear: '本文を消します。直した読みは残ります。よろしいですか？',
      pmWait: '開いたページから文を受け取っています…',
      pmFail: '文を受け取れませんでした。元のページで文をコピーして、ここに貼ってください。',
      backupMsg: null,
    },
    en: {
      idle: 'Paste text to start. The dictionary (about 13 MB) downloads once, the first time only.',
      loading: function (p, mb) { return 'Downloading the dictionary… ' + p + '% (' + mb + ' of 13 MB, first time only; your text is not sent)'; },
      preparing: 'Preparing the dictionary…',
      analysing: 'Analyzing…',
      loadFailed: 'The dictionary could not be downloaded. Check your connection and paste the text again.',
      noWorker: 'This browser cannot run the analyzer (module workers are not supported). Please try a newer browser.',
      summary: function (s) { return s.ruby + ' words with furigana (' + s.marked + ' underlined as unsure); ' + s.skipped + ' left without (names, unknown words).'; },
      overLimit: function (n) { return 'Text beyond 10,000 characters (' + n.toLocaleString('en-US') + ' more) is ignored.'; },
      empty: 'Your text with furigana appears here.',
      readerHint: {
        0: 'Furigana on every kanji word.',
        2: 'No furigana on words made only of Grade 1 kanji.', 3: 'No furigana on words made only of Grade 1–2 kanji.',
        4: 'No furigana on words made only of Grade 1–3 kanji.', 5: 'No furigana on words made only of Grade 1–4 kanji.',
        6: 'No furigana on words made only of Grade 1–5 kanji.', 7: 'No furigana on words made only of elementary-school kanji.',
        8: 'Furigana only on words with kanji outside the Jōyō list.',
      },
      markTitle: { one: 'One-kanji word: the reading may depend on context', split: 'Split by the dictionary: please check', amb: 'This word has more than one reading' },
      fixNote: function (u) {
        if (u.skip === 'proper') return 'Names are left without furigana. Enter a reading to add one.';
        if (u.skip === 'unknown' || u.skip === 'align') return 'Not in the dictionary. Enter a reading to add one.';
        if (u.skip === 'user') return 'Set to “no furigana”.';
        if (u.src === 'user') return 'Your corrected reading.';
        if (u.mark === 'amb') return 'This word has more than one reading.';
        if (u.mark) return 'The tool is not sure about this reading.';
        return '';
      },
      badReading: 'Enter the reading in hiragana (or katakana).',
      copied: 'Copied.',
      copyFailed: 'Could not copy. Open “Output format and more settings” and copy from the box.',
      nothing: 'Paste some text first.',
      dictEmpty: 'Nothing yet. Tap a word in the preview to correct its reading.',
      skipLabel: '(no furigana)',
      del: 'Delete',
      credit: 'Made at yorozu-craft.com/furigana/print/',
      exported: 'Saved to a file. To move to a new device, copy the file there and press “Load from file”.',
      tooBig: 'The file is too large. Choose a file saved by this tool.',
      confirmImport: 'Replace your current text, settings and corrected readings with the file?',
      imported: 'Loaded from the file.',
      unreadable: 'Could not read the file.',
      confirmClear: 'Clear the text? Your corrected readings stay.',
      pmWait: 'Receiving text from the page you came from…',
      pmFail: 'No text arrived. Copy the text on the original page and paste it here.',
      backupMsg: {
        unreadable: 'Could not read the file. Choose a .json file saved with “Save to file” in this tool.',
        other: function (t) { return 'This file belongs to another tool (' + t + '). Choose a file saved by this tool.'; },
        newer: 'This file was saved by a newer version of the tool. Reload the page and try again.',
        format: 'The file format is not valid.',
        missing: 'The file is missing data.',
      },
    },
  };
  var T = TEXT[LANG];

  // --- ブラウザへの保存（README「ツールを追加するとき」12。キーは furigana_ で始める）---
  var store = {
    get: function (name, fallback) {
      try { var v = localStorage.getItem('furigana_' + name); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (name, value) {
      try { localStorage.setItem('furigana_' + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    src: $('src'), count: $('count'), limitMsg: $('limit-msg'), reader: $('reader'), readerHint: $('reader-hint'), marks: $('marks'),
    size: $('size'), format: $('format'), statusText: $('status-text'), bar: $('bar'), barIn: $('bar-in'), preview: $('preview'),
    out: $('out'), vertical: $('vertical'), printmarks: $('printmarks'), credit: $('credit'), dictCount: $('dict-count'),
    dictList: $('dict-list'), backupMsg: $('backup-msg'), printSheet: $('print-sheet'), fixbar: $('fixbar'), actions: $('actions'),
  };

  var settings = Calc.normalizeSettings(store.get('settings', {}));
  var userDict = Calc.normalizeUserDict(store.get('dict', {}));
  var levels = Calc.buildLevels(C);
  var extra = null;          // 追加辞書（data/extra-dict.json）。解析するときに読む
  var worker = null, workerReady = false, workerFailed = false;
  var reqId = 0, pending = {};
  var last = { text: null, raw: null, units: [], pieces: [] };

  // --- 設定を画面へ・画面から ---
  function applySettingsToForm() {
    el.reader.value = String(settings.reader === 1 ? 0 : settings.reader);
    el.marks.checked = settings.showMarks;
    el.size.value = settings.size;
    el.format.value = settings.format;
    el.vertical.checked = settings.vertical;
    el.printmarks.checked = settings.printMarks;
    el.credit.checked = settings.credit;
    document.querySelectorAll('input[name="script"]').forEach(function (r) { r.checked = r.value === settings.script; });
    el.readerHint.textContent = T.readerHint[settings.reader] || T.readerHint[0];
  }
  function readSettingsFromForm() {
    var sc = document.querySelector('input[name="script"]:checked');
    settings = Calc.normalizeSettings({
      reader: el.reader.value, showMarks: el.marks.checked, size: el.size.value, format: el.format.value,
      vertical: el.vertical.checked, printMarks: el.printmarks.checked, credit: el.credit.checked, script: sc ? sc.value : 'hiragana',
    });
    store.set('settings', settings);
    el.readerHint.textContent = T.readerHint[settings.reader] || T.readerHint[0];
  }

  // --- 状態の表示（高さは CSS で確保してあり、文が変わってもずれない）---
  function status(text, progress) {
    el.statusText.textContent = text;
    if (progress == null) { el.bar.hidden = true; }
    else { el.bar.hidden = false; el.barIn.style.width = Math.max(2, Math.min(100, progress)) + '%'; }
  }

  // --- 解析器（Web Worker）---
  function ensureWorker() {
    if (worker || workerFailed) return;
    try {
      worker = new Worker(new URL('worker.js', BASE), { type: 'module' });
    } catch (e) { workerFailed = true; status(T.noWorker); return; }
    worker.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.type === 'progress') {
        var p = Math.floor(100 * m.loaded / m.total);
        if (!m.cached) status(T.loading(Math.min(100, p), (m.loaded / 1048576).toFixed(1)), p);
        else status(T.preparing, 100);
        if (p >= 100) status(T.preparing, 100);
      } else if (m.type === 'ready') {
        workerReady = true;
        window.__furiganaLoad = { fetchMs: m.fetchMs, initMs: m.initMs };   // 計測用（画面には出さない）
        analyse();
      } else if (m.type === 'tokens') {
        var cb = pending[m.id]; delete pending[m.id];
        if (cb) cb(m.tokens);
      } else if (m.type === 'error') {
        if (!workerReady) { workerFailed = false; worker.terminate(); worker = null; status(T.loadFailed); }
        else status(T.loadFailed);
      }
    };
    worker.onerror = function () { workerFailed = true; status(T.noWorker); };
    var a = C.analyzer.value;
    worker.postMessage({ type: 'load', url: new URL(a.path + a.wasm, BASE).href, bytes: a.bytes });
    status(T.loading(0, '0.0'), 0);
  }
  function loadExtra() {
    if (extra) return Promise.resolve(extra);
    return fetch(new URL(C.placeNames.value, BASE).href).then(function (r) { return r.json(); })
      .then(function (d) { extra = d.entries || {}; return extra; })
      .catch(function () { extra = {}; return extra; });   // 追加辞書が無くても振れる（地名・複合語が減るだけ）
  }

  // --- 解析 → 単位 → 表示 ---
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(analyse, 300); }
  function currentText() { return Calc.clampInput(el.src.value).text; }

  function analyse() {
    var text = currentText();
    if (!text.trim()) { last = { text: '', raw: [], units: [], pieces: [] }; render(); status(T.idle); return; }
    ensureWorker();
    if (!workerReady) return;   // 読み込みが終わると ready からもう一度呼ばれる
    if (last.text === text && last.raw) { relayout(); return; }
    status(T.analysing, null);
    var id = ++reqId;
    loadExtra().then(function () {
      pending[id] = function (raw) {
        if (id !== reqId) return;   // 古い結果は捨てる
        last.text = text; last.raw = raw;
        relayout();
      };
      worker.postMessage({ type: 'tokenize', id: id, text: text });
    });
  }
  // 設定・直した読みが変わったら、解析はそのままで振り直す
  function relayout() {
    if (!last.text) { render(); return; }
    var toks = Calc.alignTokens(last.text, last.raw);
    last.units = Calc.annotate(last.text, toks, { reader: settings.reader }, { levels: levels, user: userDict, extra: extra || {} });
    last.pieces = Calc.toPieces(last.units, settings.script);
    render();
    status(T.summary(Calc.summarize(last.units)));
  }

  // 見本: 語ごとに span（data-i）で包み、タップで直せるようにする
  function unitHtml(u, i, withMarks) {
    if (!u.word) return Calc.escHtml(u.text).replace(/\r?\n/g, '<br>');
    var inner;
    if (u.ruby) {
      inner = u.segs.map(function (sg) {
        if (sg.r == null) return Calc.escHtml(sg.b);
        var r = settings.script === 'romaji' ? Calc.toRomaji(sg.r, /動詞/.test(u.pos || '')) : sg.r;
        return '<ruby>' + Calc.escHtml(sg.b) + '<rp>(</rp><rt>' + Calc.escHtml(r) + '</rt><rp>)</rp></ruby>';
      }).join('');
    } else inner = Calc.escHtml(u.text);
    var cls = 'w' + (u.ruby && u.mark && withMarks ? ' m' : '') + (u.skip ? ' skip' : '') + (u.src === 'user' ? ' user' : '');
    var title = u.ruby && u.mark && withMarks ? ' title="' + Calc.escHtml(T.markTitle[u.mark] || '') + '"' : '';
    return '<span class="' + cls + '" data-i="' + i + '" tabindex="0" role="button"' + title + '>' + inner + '</span>';
  }
  function sheetHtml(withMarks, tappable) {
    var h = last.units.map(function (u, i) { return unitHtml(u, i, withMarks); }).join('');
    if (!tappable) h = h.replace(/ tabindex="0" role="button"/g, '');
    return h;
  }
  function render() {
    el.preview.className = 'sheet size-' + settings.size;
    if (!last.units.length) {
      el.preview.innerHTML = '<p class="sheet-empty">' + Calc.escHtml(T.empty) + '</p>';
      el.out.value = '';
      updateFixbar();
      return;
    }
    el.preview.innerHTML = sheetHtml(settings.showMarks, true);
    el.out.value = formatText(settings.format);
    updateFixbar();
  }
  function formatText(f) {
    var p = last.pieces;
    if (f === 'aozora') return Calc.toAozora(p);
    if (f === 'brackets') return Calc.toBrackets(p);
    if (f === 'hiragana') return Calc.toHiraganaOnly(p);
    return Calc.toHtml(p);
  }

  // --- 入力 ---
  function onInput() {
    var len = el.src.value.length;
    el.count.textContent = Math.min(len, Calc.MAX_CHARS).toLocaleString(LANG === 'en' ? 'en-US' : 'ja-JP');
    el.limitMsg.textContent = len > Calc.MAX_CHARS ? T.overLimit(len - Calc.MAX_CHARS) : '';
    store.set('text', currentText());
    schedule();
  }
  el.src.addEventListener('input', onInput);

  ['reader', 'marks', 'size', 'format', 'vertical', 'printmarks', 'credit'].forEach(function (k) {
    el[k].addEventListener('change', function () { readSettingsFromForm(); relayout(); });
  });
  document.querySelectorAll('input[name="script"]').forEach(function (r) {
    r.addEventListener('change', function () { readSettingsFromForm(); relayout(); });
  });

  // --- 印刷（A4。広告・画面の部品は CSS で消す）---
  function buildPrintSheet() {
    var cls = 'print-sheet size-' + settings.size + (settings.vertical ? ' vertical' : '');
    el.printSheet.className = cls;
    el.printSheet.innerHTML = '<div class="print-body sheet" lang="ja">' + sheetHtml(settings.printMarks, false) + '</div>' +
      (settings.credit ? '<p class="credit">' + Calc.escHtml(T.credit) + '</p>' : '');
  }
  window.addEventListener('beforeprint', buildPrintSheet);
  document.querySelectorAll('[data-action="print"]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!last.units.length) { status(T.nothing); el.src.focus(); return; }
      buildPrintSheet();
      window.print();
    });
  });

  // --- コピー ---
  function copyText(text, html) {
    if (navigator.clipboard && window.ClipboardItem && html) {
      var item = new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) });
      return navigator.clipboard.write([item]);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error('no clipboard'));
  }
  $('copy').addEventListener('click', function () {
    if (!last.units.length) { status(T.nothing); return; }
    var f = settings.format;
    var p = f === 'html'
      ? copyText(Calc.toBrackets(last.pieces), '<div lang="ja">' + Calc.toHtml(last.pieces) + '</div>')
      : copyText(formatText(f));
    p.then(function () { status(T.copied); }, function () { $('more').open = true; el.out.focus(); el.out.select(); status(T.copyFailed); });
  });

  // --- タップで直す（端末の辞書 furigana_dict）---
  var dlg = $('fix-dialog'), fixUnit = null;
  function openFix(i) {
    var u = last.units[i];
    if (!u || !u.word) return;
    fixUnit = u;
    $('fix-title').textContent = u.text;
    $('fix-note').textContent = T.fixNote(u);
    $('fix-reading').value = u.skip ? '' : (u.reading || '');
    $('fix-error').textContent = '';
    $('fix-reset').hidden = !Object.prototype.hasOwnProperty.call(userDict, u.text);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    $('fix-reading').focus();
  }
  el.preview.addEventListener('click', function (ev) {
    var w = ev.target.closest && ev.target.closest('.w');
    if (w) openFix(Number(w.getAttribute('data-i')));
  });
  el.preview.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var w = ev.target.closest && ev.target.closest('.w');
    if (w) { ev.preventDefault(); openFix(Number(w.getAttribute('data-i'))); }
  });
  $('fix-form').addEventListener('submit', function (ev) {
    var action = ev.submitter ? ev.submitter.value : 'save';
    if (!fixUnit) return;
    var key = fixUnit.text;
    if (action === 'save') {
      var r = Calc.cleanReading($('fix-reading').value);
      if (!r) { ev.preventDefault(); $('fix-error').textContent = T.badReading; return; }
      userDict[key] = r;
    } else if (action === 'skip') userDict[key] = '';
    else if (action === 'reset') delete userDict[key];
    else return;
    saveDict();
    relayout();
  });
  function saveDict() {
    userDict = Calc.normalizeUserDict(userDict);
    store.set('dict', userDict);
    renderDict();
  }
  function renderDict() {
    var keys = Object.keys(userDict);
    el.dictCount.textContent = String(keys.length);
    if (!keys.length) { el.dictList.innerHTML = '<li class="small">' + Calc.escHtml(T.dictEmpty) + '</li>'; return; }
    el.dictList.innerHTML = keys.map(function (k) {
      return '<li><span lang="ja">' + Calc.escHtml(k) + '</span> → <span lang="ja">' + Calc.escHtml(userDict[k] || T.skipLabel) + '</span> ' +
        '<button type="button" class="btn btn-small btn-sub" data-del="' + Calc.escHtml(k) + '">' + Calc.escHtml(T.del) + '</button></li>';
    }).join('');
  }
  el.dictList.addEventListener('click', function (ev) {
    var k = ev.target.getAttribute && ev.target.getAttribute('data-del');
    if (k == null) return;
    delete userDict[k];
    saveDict();
    relayout();
  });

  // --- 大きな字で読む ---
  var rv = $('reading-view'), rvSize = 1.6;
  $('open-reading').addEventListener('click', function () {
    if (!last.units.length) { status(T.nothing); el.src.focus(); return; }
    $('rv-body').innerHTML = sheetHtml(false, false);
    $('rv-body').style.fontSize = rvSize + 'rem';
    if (rv.showModal) rv.showModal(); else rv.setAttribute('open', '');
  });
  $('rv-close').addEventListener('click', function () { rv.close ? rv.close() : rv.removeAttribute('open'); });
  $('rv-larger').addEventListener('click', function () { rvSize = Math.min(3.2, rvSize + 0.2); $('rv-body').style.fontSize = rvSize + 'rem'; });
  $('rv-smaller').addEventListener('click', function () { rvSize = Math.max(1.0, rvSize - 0.2); $('rv-body').style.fontSize = rvSize + 'rem'; });

  // --- 固定バー（見本ができていて、印刷ボタンが画面の外にあるとき）---
  var actionsVisible = true;
  function updateFixbar() { el.fixbar.hidden = !(last.units.length && !actionsVisible); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { actionsVisible = es[0].isIntersecting; updateFixbar(); }).observe(el.actions);
  }

  // --- 書き出し・読み込み（README「ツールを追加するとき」20。決定 D31）---
  $('backup-export').addEventListener('click', function () {
    var data = { text: currentText(), settings: settings, dict: userDict };
    var blob = new Blob([JSON.stringify(Calc.buildBackup(TOOL, data), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = Calc.backupFileName(TOOL);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    el.backupMsg.textContent = T.exported;
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { el.backupMsg.textContent = T.tooBig; return; }
    file.text().then(function (text) {
      var r = Calc.parseBackup(text, TOOL, ['dict'], T.backupMsg || undefined);
      if (!r.ok) { el.backupMsg.textContent = r.error; return; }
      if (!window.confirm(T.confirmImport)) return;
      userDict = Calc.normalizeUserDict(r.data.dict);
      settings = Calc.normalizeSettings(r.data.settings);
      store.set('settings', settings);
      saveDict();
      applySettingsToForm();
      el.src.value = typeof r.data.text === 'string' ? Calc.clampInput(r.data.text).text : '';
      onInput();
      el.backupMsg.textContent = T.imported;
    }, function () { el.backupMsg.textContent = T.unreadable; });
  });
  $('clear-all').addEventListener('click', function () {
    if (!window.confirm(T.confirmClear)) return;
    el.src.value = '';
    onInput();
  });

  // --- ブックマークレット（決定 D73）と、そこから来た文 ---
  $('bookmarklet').href = Calc.makeBookmarklet(location.origin + location.pathname);
  $('bookmarklet').addEventListener('click', function (ev) { if (!/^javascript:/.test(this.getAttribute('href'))) ev.preventDefault(); });
  function takeIncoming() {
    var h = location.hash;
    var t = Calc.readHashText(h);
    if (t != null) {
      history.replaceState(null, '', location.pathname + location.search);   // 本文を履歴・URL に残さない
      el.src.value = t; onInput(); return;
    }
    if (h === '#pm' && window.opener) {
      history.replaceState(null, '', location.pathname + location.search);
      status(T.pmWait);
      var got = false;
      window.addEventListener('message', function onMsg(ev) {
        if (ev.source !== window.opener || !ev.data || ev.data.type !== 'furigana-text' || typeof ev.data.text !== 'string') return;
        got = true;
        window.removeEventListener('message', onMsg);
        el.src.value = Calc.clampInput(ev.data.text).text; onInput();
      });
      // 「準備できた」とだけ伝える（中身は何も渡さない）
      try { window.opener.postMessage({ type: 'furigana-ready' }, '*'); } catch (e) { /* 開いた側が閉じていれば何もしない */ }
      setTimeout(function () { if (!got) status(T.pmFail); }, 8000);
    }
  }

  // --- はじめ ---
  applySettingsToForm();
  renderDict();
  var saved = store.get('text', '');
  if (typeof saved === 'string' && saved) { el.src.value = Calc.clampInput(saved).text; }
  takeIncoming();
  if (el.src.value) onInput();

  // 登録は main.js と同じ階層の sw.js（/furigana/sw.js）だけ。scope: '/' を指定しない（README「ツールを追加するとき」13）
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    addEventListener('load', function () { navigator.serviceWorker.register(new URL('sw.js', BASE).href).catch(function () {}); });
  }
})();

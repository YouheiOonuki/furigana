// ===========================
// ふりがなメーカー — 形態素解析の Web Worker（画面を止めないため）
// 解析器: lindera-wasm（MIT）＋ IPADIC（NAIST の条件。dict/lindera-2.0.0/NOTICE-IPADIC.txt）
// 本文はこの端末の中だけで解析する。通信は辞書のファイルを同じオリジンから取るときだけで、本文は含まない
// ===========================
import init, { TokenizerBuilder } from './dict/lindera-2.0.0/lindera_wasm.js';

// キャッシュ名は "furigana-" で始める（README「ツールを追加するとき」7。sw.js と同じ名前）
// 辞書のキャッシュ。sw.js の DICT_CACHE と同じ名前（画面のキャッシュ名を上げても辞書は取り直さない）
const CACHE_NAME = 'furigana-dict-lindera-2.0.0';
let tokenizer = null;
let loading = null;

async function fetchWithProgress(url, bytes) {
  // 1. キャッシュ（2 回目から通信なし・オフラインでも動く）
  try {
    if (self.caches) {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) {
        postMessage({ type: 'progress', loaded: bytes, total: bytes, cached: true });
        return await hit.arrayBuffer();
      }
    }
  } catch (e) { /* キャッシュが使えない環境（プライベートモードなど）でも続ける */ }

  // 2. 通信（進み具合を出す。GitHub Pages が gzip で返すと Content-Length は圧縮後なので、展開後の大きさ bytes で割る）
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let buf;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0, lastPost = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      const now = Date.now();
      if (now - lastPost > 100) { postMessage({ type: 'progress', loaded, total: bytes }); lastPost = now; }
    }
    const all = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    buf = all.buffer;
    postMessage({ type: 'progress', loaded, total: bytes });
  } else {
    buf = await res.arrayBuffer();
  }
  // 3. キャッシュに入れる（sw.js が既に入れていても上書きするだけ）
  try {
    if (self.caches) {
      const cache = await caches.open(CACHE_NAME);
      if (!(await cache.match(url))) await cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/wasm' } }));
    }
  } catch (e) { /* 容量不足などは無視（次回また取る） */ }
  return buf;
}

async function load(cfg) {
  const t0 = Date.now();
  const buf = await fetchWithProgress(cfg.url, cfg.bytes);
  const t1 = Date.now();
  await init({ module_or_path: buf });
  const b = new TokenizerBuilder();
  b.setDictionary('embedded://ipadic');
  b.setMode('normal');
  tokenizer = b.build();
  postMessage({ type: 'ready', fetchMs: t1 - t0, initMs: Date.now() - t1 });
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === 'load') {
      if (!loading) loading = load(msg).catch((e) => { loading = null; throw e; });
      await loading;
    } else if (msg.type === 'tokenize') {
      if (!tokenizer) { await loading; }
      // 1 回に渡す量を行ごとに区切る（長い文でも少しずつ返せるように。位置は calc.js の alignTokens が本文から探し直す）
      const out = [];
      const lines = String(msg.text).split(/(?<=\n)/);
      for (const line of lines) {
        if (!line.trim()) continue;
        for (const t of tokenizer.tokenize(line)) {
          out.push({ surface: t.surface, reading: t.reading, partOfSpeech: t.partOfSpeech, partOfSpeechSubcategory1: t.partOfSpeechSubcategory1 });
        }
      }
      postMessage({ type: 'tokens', id: msg.id, tokens: out });
    }
  } catch (e) {
    postMessage({ type: 'error', id: msg.id, message: String(e && e.message || e) });
  }
};

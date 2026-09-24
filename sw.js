/**
 * ふりがなメーカー - sw.js（Service Worker。オフライン対応にするツールだけ使う）
 * hoshizora-sanpo の sw.js と同じ方針:
 * - ネットワーク優先。オンラインなら常に最新を取得してキャッシュも更新し、オフライン（または応答が遅い）ときだけキャッシュを返す
 * - yorozu-craft.com の各ツールは同じオリジンでキャッシュ領域を共有するため、
 *   キャッシュ名には必ず "furigana-" を付け、ほかのツールのキャッシュには触れない
 * - 自分のパス配下だけを扱う。広告・アクセス解析など別オリジンや、ほかのツールのファイルは横取りしない
 * - 辞書（dict/ の wasm、約 13MB）はインストール時には取らない（本文を解析するときに worker.js が取る）。
 *   取ったあとはキャッシュ優先で返し、2 回目からは通信しない（決定 D67）。辞書の版はパス（dict/lindera-2.0.0/）に入っている
 */

'use strict';

const CACHE_PREFIX = 'furigana-';
const CACHE_NAME   = `${CACHE_PREFIX}v1`; // キャッシュする中身の構成を変えたら上げる

/** 初回インストール時に取得しておくファイル */
const PRECACHE_URLS = [
  './',
  './index.html',
  './guide.html',
  './en/',
  './en/guide.html',
  './style.css',
  './constants.js',
  './calc.js',
  './main.js',
  './worker.js',
  './dict/lindera-2.0.0/lindera_wasm.js',
  './data/extra-dict.json',
  './manifest.webmanifest',
  './favicon.svg',
  './apple-touch-icon.png',
];

/** キャッシュ優先で返すもの（大きくて変わらない辞書） */
const DICT_PREFIX = new URL('./dict/', self.registration.scope).pathname;

/** この時間ネットワークが応答しなければ、キャッシュがあればそちらを返す */
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)   // 自分のキャッシュだけ掃除する
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 同じオリジンでも、ほかのツールのファイルには手を出さない
  if (!url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;

  if (url.pathname.startsWith(DICT_PREFIX)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  const fromNetwork = fetch(request);
  event.waitUntil(
    fromNetwork
      .then((response) => {
        if (!response.ok || response.redirected) return undefined;
        const copy = response.clone();
        return caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      })
      .catch(() => undefined),
  );
  event.respondWith(networkFirst(request, fromNetwork));
});

async function networkFirst(request, fromNetwork) {
  try {
    const response = await Promise.race([fromNetwork, delay(NETWORK_TIMEOUT_MS)]);
    if (response) return response;
  } catch {
    // オフライン: 下でキャッシュを探す
  }
  const cache = await caches.open(CACHE_NAME);
  const cached = request.mode === 'navigate'
    ? (await cache.match(request, { ignoreSearch: true })) || cache.match('./')
    : await cache.match(request);
  return cached || fromNetwork;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && !response.redirected) cache.put(request, response.clone()).catch(() => {});
  return response;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms, null));
}

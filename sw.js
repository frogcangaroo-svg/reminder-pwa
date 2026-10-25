/**
 * Service Worker。画面のファイルを保存しておき、電波が悪いときでも画面だけは開けるようにする。
 * 常にネットワークを優先するので、更新はすぐ反映される。GAS への通信は保存しない。
 */
const CACHE_NAME = 'reminder-v2';
const APP_FILES = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // GitHub Pages は10分間キャッシュしてよい設定で返すため、毎回サーバーに確認させる
  event.respondWith(
    fetch(new Request(event.request, { cache: 'no-cache' }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

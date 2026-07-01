// ============================================================
// sw.js — 서비스 워커 (오프라인 지원)
// 전략: 앱 셸(HTML/JS/CSS)은 캐시 우선, 그 외는 네트워크 우선.
// Supabase API 요청은 절대 캐시하지 않음(항상 네트워크).
// 새 버전 배포 시 CACHE_VERSION 숫자만 올리면 됩니다.
// ============================================================
const CACHE_VERSION = "v3";
const CACHE_NAME = `dot-canvas-${CACHE_VERSION}`;

// 최초 설치 시 미리 캐시할 핵심 파일 (경로는 실제 파일에 맞게 조정)
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // GET만 처리, 그리고 외부 API(Supabase 등)는 캐시하지 않음
  if (e.request.method !== "GET") return;
  if (url.hostname.includes("supabase.co") || url.hostname.includes("esm.sh")) {
    return; // 브라우저 기본 동작(네트워크)
  }

  // 같은 출처(앱 셸): 캐시 우선 + 백그라운드 갱신
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const network = fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

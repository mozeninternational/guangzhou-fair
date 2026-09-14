/* ══════════════════════════════════════════════════════
   광저우 박람회 앱 — 오프라인 동작용 서비스 워커
   인터넷이 없어도 앱이 열리도록 앱 파일을 기기에 저장해 둔다.

   ⚠️ 앱을 수정해서 다시 올릴 때는 아래 CACHE 값의 숫자를 반드시 올릴 것.
      (예: v16 → v17) 숫자를 안 올리면 폰이 예전 화면을 계속 보여준다.
   ══════════════════════════════════════════════════════ */

var CACHE = 'gz-fair-v16';

var PRECACHE = [
  './',
  './index.html',
  './manifest.json'
];

// 설치 — 앱 파일을 미리 저장
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
  );
});

// 활성화 — 예전 버전 캐시 정리
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 요청 처리 전략
   ─────────────────────────────────────────────
   화면(HTML) : 네트워크 우선 (4초 제한) → 실패하면 저장해 둔 것
                → 인터넷이 되면 항상 최신, 안 되면 오프라인으로 동작
   그 외      : 저장해 둔 것 우선 → 없으면 네트워크
   외부 주소  : 건드리지 않음 (CDN·폰트 등은 원래대로)               */
self.addEventListener('fetch', function (e) {
  var req = e.request;

  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 다른 도메인(CDN, 폰트 등)은 그대로 통과
  if (url.origin !== self.location.origin) return;

  // 버전 확인용 요청(index.html?_v=...)은 항상 네트워크로
  if (url.search.indexOf('_v=') !== -1) return;

  var isPage = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isPage) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(cacheFirst(req));
  }
});

function networkFirst(req) {
  return new Promise(function (resolve) {
    var settled = false;

    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      fallback(req).then(resolve);
    }, 4000);

    fetch(req).then(function (res) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      resolve(res);
    }).catch(function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fallback(req).then(resolve);
    });
  });
}

function fallback(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return caches.match('./index.html').then(function (idx) {
      if (idx) return idx;
      return new Response(
        '<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center">' +
        '<h3>앱을 불러오지 못했어요</h3>' +
        '<p>인터넷이 연결된 곳에서 앱을 한 번 열어주세요.</p></body>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return new Response('', { status: 504 });
    });
  });
}
